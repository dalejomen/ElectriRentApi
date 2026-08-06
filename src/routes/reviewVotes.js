const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const REVIEW_VOTE_FIELDS = ["review_id", "user_id", "helpful"];

function normalizeReviewVotePayload(body = {}) {
  const payload = {};

  for (const field of REVIEW_VOTE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined) {
      payload[field] = body[field];
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "helpful")) {
    payload.helpful = payload.helpful === true || payload.helpful === "true";
  }

  return payload;
}

function buildInsertQuery(payload) {
  const fields = Object.keys(payload);
  const values = fields.map((_, index) => `$${index + 1}`);

  return {
    text: `INSERT INTO public.review_votes (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.review_votes SET ${assignments.join(", ")} WHERE id = $${fields.length + 1} RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/review-votes:
 *   get:
 *     summary: Listar votos de reseñas
 *     tags: [ReviewVotes]
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
 *         name: helpful
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
 *         description: Lista de votos de reseñas
 */
router.get("/", async (req, res) => {
  try {
    const { review_id, user_id, helpful, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.review_votes";

    if (review_id) {
      conditions.push(`review_id = $${params.length + 1}`);
      params.push(review_id);
    }

    if (user_id) {
      conditions.push(`user_id = $${params.length + 1}`);
      params.push(user_id);
    }

    if (helpful !== undefined) {
      conditions.push(`helpful = $${params.length + 1}`);
      params.push(helpful === "true" || helpful === true);
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
    res.status(500).json({ error: "Error al listar votos de reseñas", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/review-votes/{id}:
 *   get:
 *     summary: Obtener un voto de reseña
 *     tags: [ReviewVotes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Voto encontrado
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public.review_votes WHERE id = $1", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Voto de reseña no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener el voto de reseña", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/review-votes:
 *   post:
 *     summary: Crear un voto de reseña
 *     tags: [ReviewVotes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - review_id
 *               - user_id
 *               - helpful
 *             properties:
 *               review_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *               user_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174001
 *               helpful:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Voto creado
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeReviewVotePayload(req.body);

    if (!payload.review_id || !payload.user_id || payload.helpful === undefined) {
      return res.status(400).json({ error: "review_id, user_id y helpful son obligatorios" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear el voto de reseña", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/review-votes/{id}:
 *   put:
 *     summary: Actualizar un voto de reseña
 *     tags: [ReviewVotes]
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
 *               helpful:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Voto actualizado
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizeReviewVotePayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No hay campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Voto de reseña no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar el voto de reseña", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/review-votes/{id}:
 *   delete:
 *     summary: Eliminar un voto de reseña
 *     tags: [ReviewVotes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Voto eliminado
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM public.review_votes WHERE id = $1 RETURNING *", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Voto de reseña no encontrado" });
    }

    res.json({ message: "Voto de reseña eliminado", data: result.rows[0] });
  } catch (error) {
    res.status(400).json({ error: "Error al eliminar el voto de reseña", details: error.message });
  }
});

module.exports = router;
