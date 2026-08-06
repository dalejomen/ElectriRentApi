const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const REVIEW_FIELDS = [
  "booking_id",
  "session_id",
  "reviewer_user_id",
  "reviewed_user_id",
  "charger_id",
  "host_id",
  "review_type",
  "overall_rating",
  "punctuality_rating",
  "communication_rating",
  "charger_quality_rating",
  "location_rating",
  "value_rating",
  "title",
  "comment",
  "would_recommend",
  "is_anonymous",
  "published"
];

function normalizeReviewPayload(body = {}) {
  const payload = {};

  for (const field of REVIEW_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined) {
      payload[field] = body[field];
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "would_recommend")) {
    payload.would_recommend = payload.would_recommend === true || payload.would_recommend === "true";
  }

  if (Object.prototype.hasOwnProperty.call(payload, "is_anonymous")) {
    payload.is_anonymous = payload.is_anonymous === true || payload.is_anonymous === "true";
  }

  if (Object.prototype.hasOwnProperty.call(payload, "published")) {
    payload.published = payload.published === true || payload.published === "true";
  }

  return payload;
}

function buildInsertQuery(payload) {
  const fields = Object.keys(payload);
  const values = fields.map((_, index) => `$${index + 1}`);

  return {
    text: `INSERT INTO public.reviews (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.reviews SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/reviews:
 *   get:
 *     summary: Listar reseñas
 *     tags: [Reviews]
 *     parameters:
 *       - in: query
 *         name: booking_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *       - in: query
 *         name: reviewer_user_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174001
 *       - in: query
 *         name: reviewed_user_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174002
 *       - in: query
 *         name: review_type
 *         schema:
 *           type: string
 *         example: HOST
 *       - in: query
 *         name: published
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
 *         description: Lista de reseñas
 */
router.get("/", async (req, res) => {
  try {
    const { booking_id, reviewer_user_id, reviewed_user_id, review_type, published, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.reviews";

    if (booking_id) {
      conditions.push(`booking_id = $${params.length + 1}`);
      params.push(booking_id);
    }

    if (reviewer_user_id) {
      conditions.push(`reviewer_user_id = $${params.length + 1}`);
      params.push(reviewer_user_id);
    }

    if (reviewed_user_id) {
      conditions.push(`reviewed_user_id = $${params.length + 1}`);
      params.push(reviewed_user_id);
    }

    if (review_type) {
      conditions.push(`review_type = $${params.length + 1}`);
      params.push(review_type);
    }

    if (published !== undefined) {
      conditions.push(`published = $${params.length + 1}`);
      params.push(published === "true" || published === true);
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
    res.status(500).json({ error: "Error al listar reseñas", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/reviews/{id}:
 *   get:
 *     summary: Obtener una reseña
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Reseña encontrada
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public.reviews WHERE id = $1", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Reseña no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener la reseña", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/reviews:
 *   post:
 *     summary: Crear una reseña
 *     tags: [Reviews]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - booking_id
 *               - reviewer_user_id
 *               - reviewed_user_id
 *               - review_type
 *               - overall_rating
 *             properties:
 *               booking_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *               session_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174001
 *               reviewer_user_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174002
 *               reviewed_user_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174003
 *               charger_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174004
 *               host_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174005
 *               review_type:
 *                 type: string
 *                 example: HOST
 *               overall_rating:
 *                 type: number
 *                 example: 4.5
 *               punctuality_rating:
 *                 type: integer
 *                 example: 5
 *               communication_rating:
 *                 type: integer
 *                 example: 4
 *               charger_quality_rating:
 *                 type: integer
 *                 example: 4
 *               location_rating:
 *                 type: integer
 *                 example: 5
 *               value_rating:
 *                 type: integer
 *                 example: 4
 *               title:
 *                 type: string
 *                 example: Muy buen servicio
 *               comment:
 *                 type: string
 *                 example: La experiencia fue muy positiva.
 *               would_recommend:
 *                 type: boolean
 *                 example: true
 *               is_anonymous:
 *                 type: boolean
 *                 example: false
 *               published:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Reseña creada
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeReviewPayload(req.body);

    if (!payload.booking_id || !payload.reviewer_user_id || !payload.reviewed_user_id || !payload.review_type || payload.overall_rating === undefined) {
      return res.status(400).json({ error: "booking_id, reviewer_user_id, reviewed_user_id, review_type y overall_rating son obligatorios" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear la reseña", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/reviews/{id}:
 *   put:
 *     summary: Actualizar una reseña
 *     tags: [Reviews]
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
 *               title:
 *                 type: string
 *                 example: Título actualizado
 *               comment:
 *                 type: string
 *                 example: Comentario actualizado
 *               published:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Reseña actualizada
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizeReviewPayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No hay campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Reseña no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar la reseña", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/reviews/{id}:
 *   delete:
 *     summary: Eliminar una reseña
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Reseña eliminada
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM public.reviews WHERE id = $1 RETURNING *", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Reseña no encontrada" });
    }

    res.json({ message: "Reseña eliminada", data: result.rows[0] });
  } catch (error) {
    res.status(400).json({ error: "Error al eliminar la reseña", details: error.message });
  }
});

module.exports = router;
