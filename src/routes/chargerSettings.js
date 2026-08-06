const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const CHARGER_SETTINGS_FIELDS = [
  "charger_id",
  "instant_booking",
  "requires_approval",
  "minimum_booking_minutes",
  "maximum_booking_minutes",
  "booking_window_days",
  "buffer_between_bookings_minutes",
  "cancellation_hours",
  "arrival_tolerance_minutes"
];

function parseIntegerValue(value, fieldName) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed)) {
    throw new Error(`${fieldName} debe ser un entero válido`);
  }

  return parsed;
}

function normalizeChargerSettingsPayload(body = {}) {
  const payload = {};

  for (const field of CHARGER_SETTINGS_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined) {
      payload[field] = body[field];
    }
  }

  for (const field of [
    "instant_booking",
    "requires_approval"
  ]) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      payload[field] = payload[field] === true || payload[field] === "true";
    }
  }

  for (const field of [
    "minimum_booking_minutes",
    "maximum_booking_minutes",
    "booking_window_days",
    "buffer_between_bookings_minutes",
    "cancellation_hours",
    "arrival_tolerance_minutes"
  ]) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      payload[field] = parseIntegerValue(payload[field], field);
    }
  }

  return payload;
}

function buildUpsertQuery(payload) {
  const fields = Object.keys(payload);
  const values = fields.map((_, index) => `$${index + 1}`);

  return {
    text: `INSERT INTO public.charger_settings (${fields.join(",")}) VALUES (${values.join(",")}) ON CONFLICT (charger_id) DO UPDATE SET ${fields.map((field, index) => `${field} = EXCLUDED.${field}`).join(", ")}, updated_at = NOW() RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(chargerId, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.charger_settings SET ${assignments.join(", ")}, updated_at = NOW() WHERE charger_id = $${fields.length + 1} RETURNING *`,
    values: [...fields.map((field) => payload[field]), chargerId]
  };
}

/**
 * @openapi
 * /api/v1/charger-settings:
 *   get:
 *     summary: Listar configuraciones de cargadores
 *     tags: [ChargerSettings]
 *     parameters:
 *       - in: query
 *         name: charger_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *       - in: query
 *         name: instant_booking
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
 *         description: Lista de configuraciones de cargadores
 */
router.get("/", async (req, res) => {
  try {
    const { charger_id, instant_booking, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.charger_settings";

    if (charger_id) {
      conditions.push(`charger_id = $${params.length + 1}`);
      params.push(charger_id);
    }

    if (instant_booking !== undefined) {
      conditions.push(`instant_booking = $${params.length + 1}`);
      params.push(instant_booking === "true" || instant_booking === true);
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
    res.status(500).json({ error: "Error al listar configuraciones de cargadores", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/charger-settings/{charger_id}:
 *   get:
 *     summary: Obtener la configuración de un cargador
 *     tags: [ChargerSettings]
 *     parameters:
 *       - in: path
 *         name: charger_id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Configuración encontrada
 */
router.get("/:charger_id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public.charger_settings WHERE charger_id = $1", [req.params.charger_id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Configuración de cargador no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener la configuración de cargador", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/charger-settings:
 *   post:
 *     summary: Crear o actualizar la configuración de un cargador
 *     tags: [ChargerSettings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - charger_id
 *             properties:
 *               charger_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *               instant_booking:
 *                 type: boolean
 *                 example: true
 *               requires_approval:
 *                 type: boolean
 *                 example: false
 *               minimum_booking_minutes:
 *                 type: integer
 *                 example: 30
 *               maximum_booking_minutes:
 *                 type: integer
 *                 example: 480
 *               booking_window_days:
 *                 type: integer
 *                 example: 90
 *               buffer_between_bookings_minutes:
 *                 type: integer
 *                 example: 15
 *               cancellation_hours:
 *                 type: integer
 *                 example: 24
 *               arrival_tolerance_minutes:
 *                 type: integer
 *                 example: 15
 *     responses:
 *       201:
 *         description: Configuración creada o actualizada
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeChargerSettingsPayload(req.body);

    if (!payload.charger_id) {
      return res.status(400).json({ error: "charger_id es obligatorio" });
    }

    const query = buildUpsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear o actualizar la configuración de cargador", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/charger-settings/{charger_id}:
 *   put:
 *     summary: Actualizar la configuración de un cargador
 *     tags: [ChargerSettings]
 *     parameters:
 *       - in: path
 *         name: charger_id
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
 *               instant_booking:
 *                 type: boolean
 *                 example: false
 *               requires_approval:
 *                 type: boolean
 *                 example: true
 *               minimum_booking_minutes:
 *                 type: integer
 *                 example: 60
 *     responses:
 *       200:
 *         description: Configuración actualizada
 */
router.put("/:charger_id", async (req, res) => {
  try {
    const payload = normalizeChargerSettingsPayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No se proporcionaron campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.charger_id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Configuración de cargador no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar la configuración de cargador", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/charger-settings/{charger_id}:
 *   delete:
 *     summary: Eliminar la configuración de un cargador
 *     tags: [ChargerSettings]
 *     parameters:
 *       - in: path
 *         name: charger_id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Configuración eliminada
 */
router.delete("/:charger_id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM public.charger_settings WHERE charger_id = $1 RETURNING *", [req.params.charger_id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Configuración de cargador no encontrada" });
    }

    res.json({ message: "Configuración de cargador eliminada correctamente", chargerSettings: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar la configuración de cargador", details: error.message });
  }
});

module.exports = router;
