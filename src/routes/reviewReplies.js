const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const REVIEW_REPLY_FIELDS = ["review_id", "user_id", "reply"];

function normalizeReviewReplyPayload(body = {}) {
  const payload = {};

  for (const field of REVIEW_REPLY_FIELDS) {
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
    text: `INSERT INTO public.review_replies (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.review_replies SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/review-replies:
 *   get:
 *     summary: Listar respuestas a reseñas
 *     tags: [ReviewReplies]
 *     parameters:
 *       - in: query
 *         name: review_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *       - in: query
 *         name: user_id
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
 *         description: Lista de respuestas a reseñas
 */
router.get("/", async (req, res) => {
  try {
    const { review_id, user_id, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.review_replies";

    if (review_id) {
      conditions.push(`review_id = $${params.length + 1}`);
      params.push(review_id);
    }

    if (user_id) {
      conditions.push(`user_id = $${params.length + 1}`);
      params.push(user_id);
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
    res.status(500).json({ error: "Error al listar respuestas a reseñas", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/review-replies/{id}:
 *   get:
 *     summary: Obtener una respuesta a reseña
 *     tags: [ReviewReplies]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Respuesta encontrada
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public.review_replies WHERE id = $1", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Respuesta a reseña no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener la respuesta a reseña", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/review-replies:
 *   post:
 *     summary: Crear una respuesta a reseña
 *     tags: [ReviewReplies]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - review_id
 *               - user_id
 *               - reply
 *             properties:
 *               review_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *               user_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174001
 *               reply:
 *                 type: string
 *                 example: Gracias por tu comentario.
 *     responses:
 *       201:
 *         description: Respuesta creada
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeReviewReplyPayload(req.body);

    if (!payload.review_id || !payload.user_id || !payload.reply) {
      return res.status(400).json({ error: "review_id, user_id y reply son obligatorios" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear la respuesta a reseña", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/review-replies/{id}:
 *   put:
 *     summary: Actualizar una respuesta a reseña
 *     tags: [ReviewReplies]
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
 *               reply:
 *                 type: string
 *                 example: Respuesta actualizada.
 *     responses:
 *       200:
 *         description: Respuesta actualizada
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizeReviewReplyPayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No hay campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Respuesta a reseña no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar la respuesta a reseña", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/review-replies/{id}:
 *   delete:
 *     summary: Eliminar una respuesta a reseña
 *     tags: [ReviewReplies]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Respuesta eliminada
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM public.review_replies WHERE id = $1 RETURNING *", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Respuesta a reseña no encontrada" });
    }

    res.json({ message: "Respuesta a reseña eliminada", data: result.rows[0] });
  } catch (error) {
    res.status(400).json({ error: "Error al eliminar la respuesta a reseña", details: error.message });
  }
});

module.exports = router;
