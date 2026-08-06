const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const REPORT_EXPORT_FIELDS = [
  "execution_id",
  "export_format",
  "file_name",
  "storage_url",
  "file_size"
];

function normalizeReportExportPayload(body = {}) {
  const payload = {};

  for (const field of REPORT_EXPORT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined) {
      payload[field] = body[field];
    }
  }

  return payload;
}

function buildInsertQuery(payload) {
  const fields = Object.keys(payload);
  const values = fields.map((_, index) => `$${index + 1}`);

  return {
    text: `INSERT INTO public.report_exports (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.report_exports SET ${assignments.join(", ")} WHERE id = $${fields.length + 1} RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/report-exports:
 *   get:
 *     summary: Listar exportaciones de reportes
 *     tags: [ReportExports]
 *     parameters:
 *       - in: query
 *         name: execution_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *       - in: query
 *         name: export_format
 *         schema:
 *           type: string
 *         example: CSV
 *       - in: query
 *         name: file_name
 *         schema:
 *           type: string
 *         example: report.csv
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
 *         description: Lista de exportaciones de reportes
 */
router.get("/", async (req, res) => {
  try {
    const { execution_id, export_format, file_name, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.report_exports";

    if (execution_id) {
      conditions.push(`execution_id = $${params.length + 1}`);
      params.push(execution_id);
    }

    if (export_format) {
      conditions.push(`export_format = $${params.length + 1}`);
      params.push(export_format);
    }

    if (file_name) {
      conditions.push(`file_name ILIKE $${params.length + 1}`);
      params.push(`%${file_name}%`);
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
    res.status(500).json({ error: "Error al listar exportaciones de reportes", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/report-exports/{id}:
 *   get:
 *     summary: Obtener una exportación de reporte
 *     tags: [ReportExports]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Exportación encontrada
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public.report_exports WHERE id = $1", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Exportación no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener la exportación", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/report-exports:
 *   post:
 *     summary: Crear una exportación de reporte
 *     tags: [ReportExports]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - execution_id
 *             properties:
 *               execution_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *               export_format:
 *                 type: string
 *                 example: CSV
 *               file_name:
 *                 type: string
 *                 example: report.csv
 *               storage_url:
 *                 type: string
 *                 example: https://storage.example.com/report.csv
 *               file_size:
 *                 type: integer
 *                 example: 2048
 *     responses:
 *       201:
 *         description: Exportación creada
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeReportExportPayload(req.body);

    if (!payload.execution_id) {
      return res.status(400).json({ error: "execution_id es obligatorio" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear la exportación", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/report-exports/{id}:
 *   put:
 *     summary: Actualizar una exportación de reporte
 *     tags: [ReportExports]
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
 *               file_name:
 *                 type: string
 *                 example: report-updated.csv
 *               storage_url:
 *                 type: string
 *                 example: https://storage.example.com/report-updated.csv
 *     responses:
 *       200:
 *         description: Exportación actualizada
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizeReportExportPayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No se proporcionaron campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Exportación no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar la exportación", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/report-exports/{id}:
 *   delete:
 *     summary: Eliminar una exportación de reporte
 *     tags: [ReportExports]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Exportación eliminada
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM public.report_exports WHERE id = $1 RETURNING *", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Exportación no encontrada" });
    }

    res.json({ message: "Exportación eliminada correctamente", reportExport: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar la exportación", details: error.message });
  }
});

module.exports = router;
