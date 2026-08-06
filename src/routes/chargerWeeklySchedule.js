const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const CHARGER_WEEKLY_SCHEDULE_FIELDS = [
  "charger_id",
  "week_day",
  "start_time",
  "end_time",
  "enabled"
];

function normalizeChargerWeeklySchedulePayload(body = {}) {
  const payload = {};

  for (const field of CHARGER_WEEKLY_SCHEDULE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined) {
      payload[field] = body[field];
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "enabled")) {
    payload.enabled = payload.enabled === true || payload.enabled === "true";
  }

  return payload;
}

function buildInsertQuery(payload) {
  const fields = Object.keys(payload);
  const values = fields.map((_, index) => `$${index + 1}`);

  return {
    text: `INSERT INTO public.charger_weekly_schedule (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.charger_weekly_schedule SET ${assignments.join(", ")} WHERE id = $${fields.length + 1} RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/charger-weekly-schedule:
 *   get:
 *     summary: Listar horarios semanales de cargadores
 *     tags: [ChargerWeeklySchedule]
 *     parameters:
 *       - in: query
 *         name: charger_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *       - in: query
 *         name: week_day
 *         schema:
 *           type: string
 *         example: MONDAY
 *       - in: query
 *         name: enabled
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
 *         description: Lista de horarios semanales de cargadores
 */
router.get("/", async (req, res) => {
  try {
    const { charger_id, week_day, enabled, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.charger_weekly_schedule";

    if (charger_id) {
      conditions.push(`charger_id = $${params.length + 1}`);
      params.push(charger_id);
    }

    if (week_day) {
      conditions.push(`week_day = $${params.length + 1}`);
      params.push(week_day);
    }

    if (enabled !== undefined) {
      conditions.push(`enabled = $${params.length + 1}`);
      params.push(enabled === "true" || enabled === true);
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
    res.status(500).json({ error: "Error al listar horarios semanales", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/charger-weekly-schedule/{id}:
 *   get:
 *     summary: Obtener un horario semanal de cargador
 *     tags: [ChargerWeeklySchedule]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Horario semanal encontrado
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public.charger_weekly_schedule WHERE id = $1", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Horario semanal no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener el horario semanal", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/charger-weekly-schedule:
 *   post:
 *     summary: Crear un horario semanal de cargador
 *     tags: [ChargerWeeklySchedule]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - charger_id
 *               - week_day
 *               - start_time
 *               - end_time
 *             properties:
 *               charger_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *               week_day:
 *                 type: string
 *                 example: MONDAY
 *               start_time:
 *                 type: string
 *                 example: 08:00:00
 *               end_time:
 *                 type: string
 *                 example: 20:00:00
 *               enabled:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Horario semanal creado
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeChargerWeeklySchedulePayload(req.body);

    if (!payload.charger_id || !payload.week_day || !payload.start_time || !payload.end_time) {
      return res.status(400).json({ error: "charger_id, week_day, start_time y end_time son obligatorios" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear el horario semanal", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/charger-weekly-schedule/{id}:
 *   put:
 *     summary: Actualizar un horario semanal de cargador
 *     tags: [ChargerWeeklySchedule]
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
 *               week_day:
 *                 type: string
 *                 example: TUESDAY
 *               start_time:
 *                 type: string
 *                 example: 09:00:00
 *               end_time:
 *                 type: string
 *                 example: 21:00:00
 *               enabled:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Horario semanal actualizado
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizeChargerWeeklySchedulePayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No se proporcionaron campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Horario semanal no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar el horario semanal", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/charger-weekly-schedule/{id}:
 *   delete:
 *     summary: Eliminar un horario semanal de cargador
 *     tags: [ChargerWeeklySchedule]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Horario semanal eliminado
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM public.charger_weekly_schedule WHERE id = $1 RETURNING *", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Horario semanal no encontrado" });
    }

    res.json({ message: "Horario semanal eliminado correctamente", chargerWeeklySchedule: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar el horario semanal", details: error.message });
  }
});

module.exports = router;
