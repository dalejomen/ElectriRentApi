const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const REPORT_SCHEDULE_FIELDS = [
  "report_id",
  "cron_expression",
  "enabled",
  "next_execution",
  "created_by"
];

function normalizeReportSchedulePayload(body = {}) {
  const payload = {};

  for (const field of REPORT_SCHEDULE_FIELDS) {
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
    text: `INSERT INTO public.report_schedules (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.report_schedules SET ${assignments.join(", ")} WHERE id = $${fields.length + 1} RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/report-schedules:
 *   get:
 *     summary: Listar horarios de reportes
 *     tags: [ReportSchedules]
 *     parameters:
 *       - in: query
 *         name: report_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *       - in: query
 *         name: enabled
 *         schema:
 *           type: boolean
 *         example: true
 *       - in: query
 *         name: created_by
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174001
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
 *         description: Lista de horarios de reportes
 */
router.get("/", async (req, res) => {
  try {
    const { report_id, enabled, created_by, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.report_schedules";

    if (report_id) {
      conditions.push(`report_id = $${params.length + 1}`);
      params.push(report_id);
    }

    if (enabled !== undefined) {
      conditions.push(`enabled = $${params.length + 1}`);
      params.push(enabled === "true" || enabled === true);
    }

    if (created_by) {
      conditions.push(`created_by = $${params.length + 1}`);
      params.push(created_by);
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
    res.status(500).json({ error: "Error al listar horarios de reportes", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/report-schedules/{id}:
 *   get:
 *     summary: Obtener un horario de reporte
 *     tags: [ReportSchedules]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Horario encontrado
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public.report_schedules WHERE id = $1", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Horario no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener el horario", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/report-schedules:
 *   post:
 *     summary: Crear un horario de reporte
 *     tags: [ReportSchedules]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - report_id
 *               - cron_expression
 *               - created_by
 *             properties:
 *               report_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *               cron_expression:
 *                 type: string
 *                 example: 0 0 * * *
 *               enabled:
 *                 type: boolean
 *                 example: true
 *               next_execution:
 *                 type: string
 *                 format: date-time
 *                 example: 2026-08-05T00:00:00Z
 *               created_by:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174001
 *     responses:
 *       201:
 *         description: Horario creado
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeReportSchedulePayload(req.body);

    if (!payload.report_id || !payload.cron_expression || !payload.created_by) {
      return res.status(400).json({ error: "report_id, cron_expression y created_by son obligatorios" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear el horario", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/report-schedules/{id}:
 *   put:
 *     summary: Actualizar un horario de reporte
 *     tags: [ReportSchedules]
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
 *               cron_expression:
 *                 type: string
 *                 example: 0 12 * * *
 *               enabled:
 *                 type: boolean
 *                 example: false
 *               next_execution:
 *                 type: string
 *                 format: date-time
 *                 example: 2026-08-06T00:00:00Z
 *     responses:
 *       200:
 *         description: Horario actualizado
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizeReportSchedulePayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No se proporcionaron campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Horario no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar el horario", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/report-schedules/{id}:
 *   delete:
 *     summary: Eliminar un horario de reporte
 *     tags: [ReportSchedules]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Horario eliminado
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM public.report_schedules WHERE id = $1 RETURNING *", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Horario no encontrado" });
    }

    res.json({ message: "Horario eliminado correctamente", reportSchedule: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar el horario", details: error.message });
  }
});

module.exports = router;
