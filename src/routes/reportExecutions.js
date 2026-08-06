const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const REPORT_EXECUTION_FIELDS = [
  "report_id",
  "executed_by",
  "parameters",
  "execution_start",
  "execution_end",
  "duration_ms",
  "status",
  "rows_returned",
  "exported"
];

function normalizeReportExecutionPayload(body = {}) {
  const payload = {};

  for (const field of REPORT_EXECUTION_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined) {
      payload[field] = body[field];
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "exported")) {
    payload.exported = payload.exported === true || payload.exported === "true";
  }

  return payload;
}

function buildInsertQuery(payload) {
  const fields = Object.keys(payload);
  const values = fields.map((_, index) => `$${index + 1}`);

  return {
    text: `INSERT INTO public.report_executions (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.report_executions SET ${assignments.join(", ")} WHERE id = $${fields.length + 1} RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/report-executions:
 *   get:
 *     summary: Listar ejecuciones de reportes
 *     tags: [ReportExecutions]
 *     parameters:
 *       - in: query
 *         name: report_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *       - in: query
 *         name: executed_by
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174001
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         example: SUCCESS
 *       - in: query
 *         name: exported
 *         schema:
 *           type: boolean
 *         example: false
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
 *         description: Lista de ejecuciones de reportes
 */
router.get("/", async (req, res) => {
  try {
    const { report_id, executed_by, status, exported, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.report_executions";

    if (report_id) {
      conditions.push(`report_id = $${params.length + 1}`);
      params.push(report_id);
    }

    if (executed_by) {
      conditions.push(`executed_by = $${params.length + 1}`);
      params.push(executed_by);
    }

    if (status) {
      conditions.push(`status = $${params.length + 1}`);
      params.push(status);
    }

    if (exported !== undefined) {
      conditions.push(`exported = $${params.length + 1}`);
      params.push(exported === "true" || exported === true);
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
    res.status(500).json({ error: "Error al listar ejecuciones de reportes", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/report-executions/{id}:
 *   get:
 *     summary: Obtener una ejecución de reporte
 *     tags: [ReportExecutions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Ejecución encontrada
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public.report_executions WHERE id = $1", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Ejecución no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener la ejecución", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/report-executions:
 *   post:
 *     summary: Crear una ejecución de reporte
 *     tags: [ReportExecutions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - report_id
 *               - executed_by
 *               - status
 *             properties:
 *               report_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *               executed_by:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174001
 *               parameters:
 *                 type: object
 *                 example: {"date_from":"2026-01-01","date_to":"2026-01-31"}
 *               execution_start:
 *                 type: string
 *                 format: date-time
 *                 example: 2026-08-05T00:00:00Z
 *               execution_end:
 *                 type: string
 *                 format: date-time
 *                 example: 2026-08-05T00:00:10Z
 *               duration_ms:
 *                 type: integer
 *                 example: 10000
 *               status:
 *                 type: string
 *                 example: SUCCESS
 *               rows_returned:
 *                 type: integer
 *                 example: 150
 *               exported:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       201:
 *         description: Ejecución creada
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeReportExecutionPayload(req.body);

    if (!payload.report_id || !payload.executed_by || !payload.status) {
      return res.status(400).json({ error: "report_id, executed_by y status son obligatorios" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear la ejecución", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/report-executions/{id}:
 *   put:
 *     summary: Actualizar una ejecución de reporte
 *     tags: [ReportExecutions]
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
 *                 example: FAILED
 *               exported:
 *                 type: boolean
 *                 example: true
 *               rows_returned:
 *                 type: integer
 *                 example: 200
 *     responses:
 *       200:
 *         description: Ejecución actualizada
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizeReportExecutionPayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No se proporcionaron campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Ejecución no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar la ejecución", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/report-executions/{id}:
 *   delete:
 *     summary: Eliminar una ejecución de reporte
 *     tags: [ReportExecutions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Ejecución eliminada
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM public.report_executions WHERE id = $1 RETURNING *", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Ejecución no encontrada" });
    }

    res.json({ message: "Ejecución eliminada correctamente", reportExecution: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar la ejecución", details: error.message });
  }
});

module.exports = router;
