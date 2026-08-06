const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const CHARGING_SESSION_FIELDS = [
  "booking_id",
  "charger_id",
  "vehicle_id",
  "host_id",
  "driver_id",
  "session_number",
  "status",
  "scheduled_start",
  "scheduled_end",
  "started_at",
  "ended_at",
  "energy_delivered_kwh",
  "average_power_kw",
  "peak_power_kw",
  "duration_minutes",
  "price_per_unit",
  "subtotal",
  "taxes",
  "total",
  "currency",
  "stop_reason",
  "notes"
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

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${fieldName} debe ser un entero válido mayor o igual a 0`);
  }

  return parsed;
}

function normalizeChargingSessionPayload(body = {}) {
  const payload = {};

  for (const field of CHARGING_SESSION_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined) {
      payload[field] = body[field];
    }
  }

  for (const field of [
    "energy_delivered_kwh",
    "average_power_kw",
    "peak_power_kw",
    "price_per_unit",
    "subtotal",
    "taxes",
    "total"
  ]) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      payload[field] = parseNumericValue(payload[field], field);
    }
  }

  for (const field of ["duration_minutes"]) {
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
    text: `INSERT INTO public.charging_sessions (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.charging_sessions SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $${fields.length + 1} AND deleted_at IS NULL RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/charging-sessions:
 *   get:
 *     summary: Listar sesiones de carga
 *     tags: [ChargingSessions]
 *     parameters:
 *       - in: query
 *         name: booking_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *       - in: query
 *         name: charger_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174001
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         example: PENDING
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
 *         description: Lista de sesiones de carga
 */
router.get("/", async (req, res) => {
  try {
    const { booking_id, charger_id, status, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.charging_sessions WHERE deleted_at IS NULL";

    if (booking_id) {
      conditions.push(`booking_id = $${params.length + 1}`);
      params.push(booking_id);
    }

    if (charger_id) {
      conditions.push(`charger_id = $${params.length + 1}`);
      params.push(charger_id);
    }

    if (status) {
      conditions.push(`status = $${params.length + 1}`);
      params.push(status);
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
    res.status(500).json({ error: "Error al listar sesiones de carga", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/charging-sessions/{id}:
 *   get:
 *     summary: Obtener una sesión de carga
 *     tags: [ChargingSessions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Sesión encontrada
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public.charging_sessions WHERE id = $1 AND deleted_at IS NULL", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Sesión de carga no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener la sesión de carga", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/charging-sessions:
 *   post:
 *     summary: Crear una sesión de carga
 *     tags: [ChargingSessions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - booking_id
 *               - charger_id
 *               - vehicle_id
 *               - host_id
 *               - driver_id
 *               - session_number
 *             properties:
 *               booking_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *               charger_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174001
 *               vehicle_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174002
 *               host_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174003
 *               driver_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174004
 *               session_number:
 *                 type: string
 *                 example: SES-1001
 *               status:
 *                 type: string
 *                 example: PENDING
 *               scheduled_start:
 *                 type: string
 *                 format: date-time
 *                 example: 2026-08-10T10:00:00Z
 *               scheduled_end:
 *                 type: string
 *                 format: date-time
 *                 example: 2026-08-10T12:00:00Z
 *               started_at:
 *                 type: string
 *                 format: date-time
 *                 example: 2026-08-10T10:05:00Z
 *               ended_at:
 *                 type: string
 *                 format: date-time
 *                 example: 2026-08-10T12:10:00Z
 *               energy_delivered_kwh:
 *                 type: number
 *                 example: 32.5
 *               average_power_kw:
 *                 type: number
 *                 example: 18.5
 *               peak_power_kw:
 *                 type: number
 *                 example: 50.2
 *               duration_minutes:
 *                 type: integer
 *                 example: 125
 *               price_per_unit:
 *                 type: number
 *                 example: 1500.00
 *               subtotal:
 *                 type: number
 *                 example: 30000.00
 *               taxes:
 *                 type: number
 *                 example: 4800.00
 *               total:
 *                 type: number
 *                 example: 34800.00
 *               currency:
 *                 type: string
 *                 example: COP
 *               stop_reason:
 *                 type: string
 *                 example: Completed
 *               notes:
 *                 type: string
 *                 example: Sesión completada correctamente
 *     responses:
 *       201:
 *         description: Sesión creada
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeChargingSessionPayload(req.body);

    if (!payload.booking_id || !payload.charger_id || !payload.vehicle_id || !payload.host_id || !payload.driver_id || !payload.session_number) {
      return res.status(400).json({ error: "booking_id, charger_id, vehicle_id, host_id, driver_id y session_number son obligatorios" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear la sesión de carga", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/charging-sessions/{id}:
 *   put:
 *     summary: Actualizar una sesión de carga
 *     tags: [ChargingSessions]
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
 *               status:
 *                 type: string
 *                 example: IN_PROGRESS
 *               total:
 *                 type: number
 *                 example: 40000.00
 *               notes:
 *                 type: string
 *                 example: Actualizada por el operador
 *     responses:
 *       200:
 *         description: Sesión actualizada
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizeChargingSessionPayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No se proporcionaron campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Sesión de carga no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar la sesión de carga", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/charging-sessions/{id}:
 *   delete:
 *     summary: Eliminar una sesión de carga
 *     tags: [ChargingSessions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Sesión eliminada
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query("UPDATE public.charging_sessions SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Sesión de carga no encontrada" });
    }

    res.json({ message: "Sesión de carga eliminada correctamente", chargingSession: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar la sesión de carga", details: error.message });
  }
});

module.exports = router;
