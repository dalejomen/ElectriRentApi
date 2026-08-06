const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const CONVERSATION_PARTICIPANT_FIELDS = [
  "conversation_id",
  "user_id",
  "joined_at",
  "left_at",
  "is_admin",
  "muted"
];

function normalizeConversationParticipantPayload(body = {}) {
  const payload = {};

  for (const field of CONVERSATION_PARTICIPANT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined) {
      payload[field] = body[field];
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "is_admin")) {
    payload.is_admin = payload.is_admin === true || payload.is_admin === "true";
  }

  if (Object.prototype.hasOwnProperty.call(payload, "muted")) {
    payload.muted = payload.muted === true || payload.muted === "true";
  }

  return payload;
}

function buildInsertQuery(payload) {
  const fields = Object.keys(payload);
  const values = fields.map((_, index) => `$${index + 1}`);

  return {
    text: `INSERT INTO public.conversation_participants (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.conversation_participants SET ${assignments.join(", ")} WHERE id = $${fields.length + 1} RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/conversation-participants:
 *   get:
 *     summary: Listar participantes de conversación
 *     tags: [ConversationParticipants]
 *     parameters:
 *       - in: query
 *         name: conversation_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174001
 *       - in: query
 *         name: is_admin
 *         schema:
 *           type: boolean
 *         example: true
 *       - in: query
 *         name: muted
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
 *         description: Lista de participantes de conversación
 */
router.get("/", async (req, res) => {
  try {
    const { conversation_id, user_id, is_admin, muted, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.conversation_participants";

    if (conversation_id) {
      conditions.push(`conversation_id = $${params.length + 1}`);
      params.push(conversation_id);
    }

    if (user_id) {
      conditions.push(`user_id = $${params.length + 1}`);
      params.push(user_id);
    }

    if (is_admin !== undefined) {
      conditions.push(`is_admin = $${params.length + 1}`);
      params.push(is_admin === "true" || is_admin === true);
    }

    if (muted !== undefined) {
      conditions.push(`muted = $${params.length + 1}`);
      params.push(muted === "true" || muted === true);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY joined_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(Math.min(Number(limit) || 50, 100));
    params.push(Number(offset) || 0);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "Error al listar participantes", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/conversation-participants/{id}:
 *   get:
 *     summary: Obtener un participante de conversación
 *     tags: [ConversationParticipants]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Participante encontrado
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public.conversation_participants WHERE id = $1", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Participante de conversación no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener el participante", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/conversation-participants:
 *   post:
 *     summary: Crear un participante de conversación
 *     tags: [ConversationParticipants]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - conversation_id
 *               - user_id
 *             properties:
 *               conversation_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *               user_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174001
 *               joined_at:
 *                 type: string
 *                 format: date-time
 *                 example: 2026-08-10T10:00:00Z
 *               left_at:
 *                 type: string
 *                 format: date-time
 *                 example: 2026-08-10T12:00:00Z
 *               is_admin:
 *                 type: boolean
 *                 example: false
 *               muted:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       201:
 *         description: Participante creado
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeConversationParticipantPayload(req.body);

    if (!payload.conversation_id || !payload.user_id) {
      return res.status(400).json({ error: "conversation_id y user_id son obligatorios" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear el participante", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/conversation-participants/{id}:
 *   put:
 *     summary: Actualizar un participante de conversación
 *     tags: [ConversationParticipants]
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
 *               is_admin:
 *                 type: boolean
 *                 example: true
 *               muted:
 *                 type: boolean
 *                 example: true
 *               left_at:
 *                 type: string
 *                 format: date-time
 *                 example: 2026-08-10T13:00:00Z
 *     responses:
 *       200:
 *         description: Participante actualizado
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizeConversationParticipantPayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No se proporcionaron campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Participante de conversación no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar el participante", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/conversation-participants/{id}:
 *   delete:
 *     summary: Eliminar un participante de conversación
 *     tags: [ConversationParticipants]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Participante eliminado
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM public.conversation_participants WHERE id = $1 RETURNING *", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Participante de conversación no encontrado" });
    }

    res.json({ message: "Participante de conversación eliminado correctamente", conversationParticipant: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar el participante", details: error.message });
  }
});

module.exports = router;
