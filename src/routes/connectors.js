const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const CONNECTOR_FIELDS = [
  "code",
  "name",
  "description",
  "max_power_kw",
  "max_voltage",
  "max_amperage",
  "dc",
  "active"
];

function parseNumericValue(value, fieldName) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName} debe ser un número válido`);
  }

  return parsed;
}

function parseIntegerValue(value, fieldName) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} debe ser un entero válido mayor a 0`);
  }

  return parsed;
}

function normalizeConnectorPayload(body = {}) {
  const payload = {};

  for (const field of CONNECTOR_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined) {
      payload[field] = body[field];
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "max_power_kw")) {
    payload.max_power_kw = parseNumericValue(payload.max_power_kw, "max_power_kw");
  }

  for (const field of ["max_voltage", "max_amperage"]) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      payload[field] = parseIntegerValue(payload[field], field);
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "dc")) {
    payload.dc = payload.dc === true || payload.dc === "true";
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
    text: `INSERT INTO public.connectors (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.connectors SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/connectors:
 *   get:
 *     summary: Listar conectores
 *     tags: [Connectors]
 *     parameters:
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *         example: CCS2
 *       - in: query
 *         name: dc
 *         schema:
 *           type: boolean
 *         example: false
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
 *         description: Lista de conectores
 */
router.get("/", async (req, res) => {
  try {
    const { code, dc, active, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.connectors";

    if (code) {
      conditions.push(`code ILIKE $${params.length + 1}`);
      params.push(`%${code}%`);
    }

    if (dc !== undefined) {
      conditions.push(`dc = $${params.length + 1}`);
      params.push(dc === "true" || dc === true);
    }

    if (active !== undefined) {
      conditions.push(`active = $${params.length + 1}`);
      params.push(active === "true" || active === true);
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
    res.status(500).json({ error: "Error al listar conectores", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/connectors/{id}:
 *   get:
 *     summary: Obtener un conector
 *     tags: [Connectors]
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
    const result = await pool.query("SELECT * FROM public.connectors WHERE id = $1", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Conector no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener el conector", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/connectors:
 *   post:
 *     summary: Crear un conector
 *     tags: [Connectors]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - name
 *             properties:
 *               code:
 *                 type: string
 *                 example: CCS2
 *               name:
 *                 type: string
 *                 example: Combo CCS2
 *               description:
 *                 type: string
 *                 example: Conector de carga rápida tipo 2
 *               max_power_kw:
 *                 type: number
 *                 example: 350
 *               max_voltage:
 *                 type: integer
 *                 example: 1000
 *               max_amperage:
 *                 type: integer
 *                 example: 500
 *               dc:
 *                 type: boolean
 *                 example: true
 *               active:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Conector creado
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeConnectorPayload(req.body);

    if (!payload.code || !payload.name) {
      return res.status(400).json({ error: "code y name son obligatorios" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear el conector", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/connectors/{id}:
 *   put:
 *     summary: Actualizar un conector
 *     tags: [Connectors]
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
 *               name:
 *                 type: string
 *                 example: Combo CCS2 actualizado
 *               active:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Conector actualizado
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizeConnectorPayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No se proporcionaron campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Conector no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar el conector", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/connectors/{id}:
 *   delete:
 *     summary: Eliminar un conector
 *     tags: [Connectors]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Conector eliminado
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM public.connectors WHERE id = $1 RETURNING *", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Conector no encontrado" });
    }

    res.json({ message: "Conector eliminado correctamente", connector: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar el conector", details: error.message });
  }
});

module.exports = router;
