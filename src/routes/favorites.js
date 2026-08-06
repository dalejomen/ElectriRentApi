const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const FAVORITE_FIELDS = [
  "user_id",
  "charger_id",
  "notes"
];

function normalizeFavoritePayload(body = {}) {
  const payload = {};

  for (const field of FAVORITE_FIELDS) {
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
    text: `INSERT INTO public.favorites (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.favorites SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $${fields.length + 1} AND deleted_at IS NULL RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/favorites:
 *   get:
 *     summary: Listar favoritos
 *     tags: [Favorites]
 *     parameters:
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *       - in: query
 *         name: charger_id
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
 *         description: Lista de favoritos
 */
router.get("/", async (req, res) => {
  try {
    const { user_id, charger_id, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.favorites WHERE deleted_at IS NULL";

    if (user_id) {
      conditions.push(`user_id = $${params.length + 1}`);
      params.push(user_id);
    }

    if (charger_id) {
      conditions.push(`charger_id = $${params.length + 1}`);
      params.push(charger_id);
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
    res.status(500).json({ error: "Error al listar favoritos", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/favorites/{id}:
 *   get:
 *     summary: Obtener un favorito
 *     tags: [Favorites]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Favorito encontrado
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM public.favorites WHERE id = $1 AND deleted_at IS NULL",
      [req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Favorito no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener el favorito", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/favorites:
 *   post:
 *     summary: Crear un favorito
 *     tags: [Favorites]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *               - charger_id
 *             properties:
 *               user_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *               charger_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174001
 *               notes:
 *                 type: string
 *                 example: Cargador preferido para viajes largos
 *     responses:
 *       201:
 *         description: Favorito creado
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeFavoritePayload(req.body);

    if (!payload.user_id || !payload.charger_id) {
      return res.status(400).json({ error: "user_id y charger_id son obligatorios" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear el favorito", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/favorites/{id}:
 *   put:
 *     summary: Actualizar un favorito
 *     tags: [Favorites]
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
 *               notes:
 *                 type: string
 *                 example: Nota actualizada del favorito
 *     responses:
 *       200:
 *         description: Favorito actualizado
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizeFavoritePayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No se proporcionaron campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Favorito no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar el favorito", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/favorites/{id}:
 *   delete:
 *     summary: Eliminar un favorito
 *     tags: [Favorites]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Favorito eliminado
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE public.favorites SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *",
      [req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Favorito no encontrado" });
    }

    res.json({ message: "Favorito eliminado correctamente", favorite: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar el favorito", details: error.message });
  }
});

module.exports = router;
