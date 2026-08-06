const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const CONVERSATION_FIELDS = [
  "booking_id",
  "conversation_type",
  "title",
  "active",
  "created_by"
];

function normalizeConversationPayload(body = {}) {
  const payload = {};

  for (const field of CONVERSATION_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined) {
      payload[field] = body[field];
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "active")) {
    payload.active = payload.active === true || payload.active === "true";
  }

  return payload;
}

function buildInsertQuery(payload) {
  const fields = Object.keys(payload);
  const values = fields.map((_, index) => `$${index + 1}`);

  return {
    text: `INSERT INTO public.conversations (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.conversations SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/conversations:
 *   get:
 *     summary: Listar conversaciones
 *     tags: [Conversations]
 *     parameters:
 *       - in: query
 *         name: booking_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *       - in: query
 *         name: conversation_type
 *         schema:
 *           type: string
 *         example: SUPPORT
 *       - in: query
 *         name: active
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
 *         description: Lista de conversaciones
 */
router.get("/", async (req, res) => {
  try {
    const { booking_id, conversation_type, active, created_by, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.conversations";

    if (booking_id) {
      conditions.push(`booking_id = $${params.length + 1}`);
      params.push(booking_id);
    }

    if (conversation_type) {
      conditions.push(`conversation_type = $${params.length + 1}`);
      params.push(conversation_type);
    }

    if (active !== undefined) {
      conditions.push(`active = $${params.length + 1}`);
      params.push(active === "true" || active === true);
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
    res.status(500).json({ error: "Error al listar conversaciones", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/conversations/{id}:
 *   get:
 *     summary: Obtener una conversación
 *     tags: [Conversations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Conversación encontrada
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public.conversations WHERE id = $1", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Conversación no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener la conversación", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/conversations:
 *   post:
 *     summary: Crear una conversación
 *     tags: [Conversations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - conversation_type
 *               - created_by
 *             properties:
 *               booking_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *               conversation_type:
 *                 type: string
 *                 example: SUPPORT
 *               title:
 *                 type: string
 *                 example: Consulta por reserva
 *               active:
 *                 type: boolean
 *                 example: true
 *               created_by:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174001
 *     responses:
 *       201:
 *         description: Conversación creada
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeConversationPayload(req.body);

    if (!payload.conversation_type || !payload.created_by) {
      return res.status(400).json({ error: "conversation_type y created_by son obligatorios" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear la conversación", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/conversations/{id}:
 *   put:
 *     summary: Actualizar una conversación
 *     tags: [Conversations]
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
 *                 example: Conversación actualizada
 *               active:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Conversación actualizada
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizeConversationPayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No se proporcionaron campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Conversación no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar la conversación", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/conversations/{id}:
 *   delete:
 *     summary: Eliminar una conversación
 *     tags: [Conversations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Conversación eliminada
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM public.conversations WHERE id = $1 RETURNING *", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Conversación no encontrada" });
    }

    res.json({ message: "Conversación eliminada correctamente", conversation: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar la conversación", details: error.message });
  }
});

module.exports = router;
