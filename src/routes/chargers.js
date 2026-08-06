const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const CHARGER_FIELDS = [
  "host_id",
  "address_id",
  "name",
  "description",
  "charger_level",
  "max_power_kw",
  "voltage",
  "amperage",
  "manufacturer",
  "model",
  "serial_number",
  "firmware_version",
  "is_public",
  "requires_reservation",
  "auto_accept_booking",
  "parking_spaces",
  "operating_24_hours",
  "instructions",
  "active",
  "status"
];

function parseNumericValue(value, fieldName) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} debe ser un número válido mayor a 0`);
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

function normalizeChargerPayload(body = {}) {
  const payload = {};

  for (const field of CHARGER_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined) {
      payload[field] = body[field];
    }
  }

  for (const field of [
    "is_public",
    "requires_reservation",
    "auto_accept_booking",
    "operating_24_hours",
    "active"
  ]) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      payload[field] = payload[field] === true || payload[field] === "true";
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "max_power_kw")) {
    payload.max_power_kw = parseNumericValue(payload.max_power_kw, "max_power_kw");
  }

  for (const field of ["voltage", "amperage", "parking_spaces"]) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      payload[field] = parseIntegerValue(payload[field], field);
    }
  }

  return payload;
}

function buildInsertQuery(payload) {
  const fields = Object.keys(payload);
  const values = fields.map((_, index) => `$${index + 1}`);

  return {
    text: `INSERT INTO public.chargers (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.chargers SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $${fields.length + 1} AND deleted_at IS NULL RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/chargers:
 *   get:
 *     summary: Listar cargadores
 *     tags: [Chargers]
 *     parameters:
 *       - in: query
 *         name: host_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *       - in: query
 *         name: address_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174001
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         example: AVAILABLE
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
 *         description: Lista de cargadores
 */
router.get("/", async (req, res) => {
  try {
    const { host_id, address_id, status, active, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.chargers WHERE deleted_at IS NULL";

    if (host_id) {
      conditions.push(`host_id = $${params.length + 1}`);
      params.push(host_id);
    }

    if (address_id) {
      conditions.push(`address_id = $${params.length + 1}`);
      params.push(address_id);
    }

    if (status) {
      conditions.push(`status = $${params.length + 1}`);
      params.push(status);
    }

    if (active !== undefined) {
      conditions.push(`active = $${params.length + 1}`);
      params.push(active === "true" || active === true);
    }

    if (conditions.length > 0) {
      query += ` AND ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(Math.min(Number(limit) || 50, 100));
    params.push(Number(offset) || 0);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "Error al listar cargadores", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/chargers/{id}:
 *   get:
 *     summary: Obtener un cargador
 *     tags: [Chargers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Cargador encontrado
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public.chargers WHERE id = $1 AND deleted_at IS NULL", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Cargador no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener el cargador", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/chargers:
 *   post:
 *     summary: Crear un cargador
 *     tags: [Chargers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - host_id
 *               - address_id
 *               - name
 *               - charger_level
 *               - max_power_kw
 *             properties:
 *               host_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *               address_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174001
 *               name:
 *                 type: string
 *                 example: Charger Principal
 *               description:
 *                 type: string
 *                 example: Cargador de carga rápida
 *               charger_level:
 *                 type: string
 *                 example: LEVEL_2
 *               max_power_kw:
 *                 type: number
 *                 example: 22.5
 *               voltage:
 *                 type: integer
 *                 example: 240
 *               amperage:
 *                 type: integer
 *                 example: 32
 *               manufacturer:
 *                 type: string
 *                 example: Tesla
 *               model:
 *                 type: string
 *                 example: Wall Connector
 *               serial_number:
 *                 type: string
 *                 example: SN-1001
 *               firmware_version:
 *                 type: string
 *                 example: 1.0.0
 *               is_public:
 *                 type: boolean
 *                 example: true
 *               requires_reservation:
 *                 type: boolean
 *                 example: true
 *               auto_accept_booking:
 *                 type: boolean
 *                 example: false
 *               parking_spaces:
 *                 type: integer
 *                 example: 1
 *               operating_24_hours:
 *                 type: boolean
 *                 example: false
 *               instructions:
 *                 type: string
 *                 example: Instrucciones de uso
 *               active:
 *                 type: boolean
 *                 example: true
 *               status:
 *                 type: string
 *                 example: AVAILABLE
 *     responses:
 *       201:
 *         description: Cargador creado
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeChargerPayload(req.body);

    if (!payload.host_id || !payload.address_id || !payload.name || !payload.charger_level || payload.max_power_kw === undefined) {
      return res.status(400).json({ error: "host_id, address_id, name, charger_level y max_power_kw son obligatorios" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear el cargador", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/chargers/{id}:
 *   put:
 *     summary: Actualizar un cargador
 *     tags: [Chargers]
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
 *                 example: Charger Actualizado
 *               status:
 *                 type: string
 *                 example: MAINTENANCE
 *               active:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Cargador actualizado
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizeChargerPayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No se proporcionaron campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Cargador no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar el cargador", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/chargers/{id}:
 *   delete:
 *     summary: Eliminar un cargador
 *     tags: [Chargers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Cargador eliminado
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query("UPDATE public.chargers SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Cargador no encontrado" });
    }

    res.json({ message: "Cargador eliminado correctamente", charger: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar el cargador", details: error.message });
  }
});

module.exports = router;
