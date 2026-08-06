const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const REVIEW_REPORT_FIELDS = ["review_id", "reported_by", "reason", "comments", "status"];

function normalizeReviewReportPayload(body = {}) {
  const payload = {};

  for (const field of REVIEW_REPORT_FIELDS) {
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
    text: `INSERT INTO public.review_reports (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.review_reports SET ${assignments.join(", ")} WHERE id = $${fields.length + 1} RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/review-reports:
 *   get:
 *     summary: Listar reportes de reseñas
 *     tags: [ReviewReports]
 *     parameters:
 *       - in: query
 *         name: review_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *       - in: query
 *         name: reported_by
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174001
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         example: OPEN
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
 *         description: Lista de reportes de reseñas
 */
router.get("/", async (req, res) => {
  try {
    const { review_id, reported_by, status, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.review_reports";

    if (review_id) {
      conditions.push(`review_id = $${params.length + 1}`);
      params.push(review_id);
    }

    if (reported_by) {
      conditions.push(`reported_by = $${params.length + 1}`);
      params.push(reported_by);
    }

    if (status) {
      conditions.push(`status = $${params.length + 1}`);
      params.push(status);
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
    res.status(500).json({ error: "Error al listar reportes de reseñas", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/review-reports/{id}:
 *   get:
 *     summary: Obtener un reporte de reseña
 *     tags: [ReviewReports]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Reporte encontrado
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public.review_reports WHERE id = $1", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Reporte de reseña no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener el reporte de reseña", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/review-reports:
 *   post:
 *     summary: Crear un reporte de reseña
 *     tags: [ReviewReports]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - review_id
 *               - reported_by
 *               - reason
 *             properties:
 *               review_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *               reported_by:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174001
 *               reason:
 *                 type: string
 *                 example: Contenido inapropiado
 *               comments:
 *                 type: string
 *                 example: Se observó lenguaje ofensivo.
 *               status:
 *                 type: string
 *                 example: OPEN
 *     responses:
 *       201:
 *         description: Reporte creado
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeReviewReportPayload(req.body);

    if (!payload.review_id || !payload.reported_by || !payload.reason) {
      return res.status(400).json({ error: "review_id, reported_by y reason son obligatorios" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear el reporte de reseña", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/review-reports/{id}:
 *   put:
 *     summary: Actualizar un reporte de reseña
 *     tags: [ReviewReports]
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
 *               reason:
 *                 type: string
 *                 example: Motivo actualizado
 *               comments:
 *                 type: string
 *                 example: Comentarios actualizados.
 *               status:
 *                 type: string
 *                 example: RESOLVED
 *     responses:
 *       200:
 *         description: Reporte actualizado
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizeReviewReportPayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No hay campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Reporte de reseña no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar el reporte de reseña", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/review-reports/{id}:
 *   delete:
 *     summary: Eliminar un reporte de reseña
 *     tags: [ReviewReports]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Reporte eliminado
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM public.review_reports WHERE id = $1 RETURNING *", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Reporte de reseña no encontrado" });
    }

    res.json({ message: "Reporte de reseña eliminado", data: result.rows[0] });
  } catch (error) {
    res.status(400).json({ error: "Error al eliminar el reporte de reseña", details: error.message });
  }
});

module.exports = router;
