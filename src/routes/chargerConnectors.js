const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const CHARGER_CONNECTOR_FIELDS = [
  "charger_id",
  "connector_id",
  "quantity",
  "max_power_kw",
  "active"
];

function parseIntegerValue(value, fieldName) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed)) {
    throw new Error(`${fieldName} debe ser un entero válido`);
  }

  return parsed;
}

function parseNumericValue(value, fieldName) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName} debe ser un número válido`);
  }

  return parsed;
}

function normalizeChargerConnectorPayload(body = {}) {
  const payload = {};

  for (const field of CHARGER_CONNECTOR_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined) {
      payload[field] = body[field];
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "quantity")) {
    payload.quantity = parseIntegerValue(payload.quantity, "quantity");

    if (payload.quantity <= 0) {
      throw new Error("quantity debe ser mayor a 0");
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "max_power_kw")) {
    payload.max_power_kw = parseNumericValue(payload.max_power_kw, "max_power_kw");

    if (payload.max_power_kw <= 0) {
      throw new Error("max_power_kw debe ser mayor a 0");
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "active")) {
    payload.active = payload.active === true || payload.active === "true";
  }

  return payload;
}

function buildInsertQuery(payload) {
  const fields = Object.keys(payload);
  const values = fields.map((_, index) => `$${index + 1}`);

  return {
    text: `INSERT INTO public.charger_connectors (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.charger_connectors SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/charger-connectors:
 *   get:
 *     summary: Listar conectores de cargadores
 *     tags: [ChargerConnectors]
 *     parameters:
 *       - in: query
 *         name: charger_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *       - in: query
 *         name: connector_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174001
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *         example: true
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         example: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *         example: 0
 *     responses:
 *       200:
 *         description: Lista de conectores de cargadores
 */
router.get("/", async (req, res) => {
  try {
    const { charger_id, connector_id, active, quantity, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.charger_connectors";

    if (charger_id) {
      conditions.push(`charger_id = $${params.length + 1}`);
      params.push(charger_id);
    }

    if (connector_id) {
      conditions.push(`connector_id = $${params.length + 1}`);
      params.push(connector_id);
    }

    if (active !== undefined) {
      conditions.push(`active = $${params.length + 1}`);
      params.push(active === "true" || active === true);
    }

    if (quantity !== undefined) {
      conditions.push(`quantity = $${params.length + 1}`);
      params.push(parseIntegerValue(quantity, "quantity"));
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(Math.min(Number(limit) || 50, 100));
    params.push(Number(offset) || 0);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "Error al listar conectores de cargadores", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/charger-connectors/{id}:
 *   get:
 *     summary: Obtener un conector de cargador
 *     tags: [ChargerConnectors]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Conector encontrado
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public.charger_connectors WHERE id = $1", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Conector de cargador no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener el conector de cargador", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/charger-connectors:
 *   post:
 *     summary: Crear un conector de cargador
 *     tags: [ChargerConnectors]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - charger_id
 *               - connector_id
 *             properties:
 *               charger_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *               connector_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174001
 *               quantity:
 *                 type: integer
 *                 example: 1
 *               max_power_kw:
 *                 type: number
 *                 example: 22.5
 *               active:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Conector de cargador creado
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeChargerConnectorPayload(req.body);

    if (!payload.charger_id || !payload.connector_id) {
      return res.status(400).json({ error: "charger_id y connector_id son obligatorios" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear el conector de cargador", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/charger-connectors/{id}:
 *   put:
 *     summary: Actualizar un conector de cargador
 *     tags: [ChargerConnectors]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               quantity:
 *                 type: integer
 *                 example: 2
 *               max_power_kw:
 *                 type: number
 *                 example: 50
 *               active:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Conector de cargador actualizado
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizeChargerConnectorPayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No se proporcionaron campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Conector de cargador no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar el conector de cargador", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/charger-connectors/{id}:
 *   delete:
 *     summary: Eliminar un conector de cargador
 *     tags: [ChargerConnectors]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Conector de cargador eliminado
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM public.charger_connectors WHERE id = $1 RETURNING *", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Conector de cargador no encontrado" });
    }

    res.json({ message: "Conector de cargador eliminado correctamente", chargerConnector: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar el conector de cargador", details: error.message });
  }
});

module.exports = router;
