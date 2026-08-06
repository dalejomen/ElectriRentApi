const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const MESSAGE_FIELDS = [
  "conversation_id",
  "sender_id",
  "message_type",
  "message",
  "reply_to_message_id",
  "edited",
  "edited_at",
  "deleted"
];

function normalizeMessagePayload(body = {}) {
  const payload = {};

  for (const field of MESSAGE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined) {
      payload[field] = body[field];
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "edited")) {
    payload.edited = payload.edited === true || payload.edited === "true";
  }

  if (Object.prototype.hasOwnProperty.call(payload, "deleted")) {
    payload.deleted = payload.deleted === true || payload.deleted === "true";
  }

  return payload;
}

function buildInsertQuery(payload) {
  const fields = Object.keys(payload);
  const values = fields.map((_, index) => `$${index + 1}`);

  return {
    text: `INSERT INTO public.messages (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.messages SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/messages:
 *   get:
 *     summary: Listar mensajes
 *     tags: [Messages]
 *     parameters:
 *       - in: query
 *         name: conversation_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *       - in: query
 *         name: sender_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174001
 *       - in: query
 *         name: message_type
 *         schema:
 *           type: string
 *         example: TEXT
 *       - in: query
 *         name: deleted
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
 *         description: Lista de mensajes
 */
router.get("/", async (req, res) => {
  try {
    const { conversation_id, sender_id, message_type, deleted, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.messages";

    if (conversation_id) {
      conditions.push(`conversation_id = $${params.length + 1}`);
      params.push(conversation_id);
    }

    if (sender_id) {
      conditions.push(`sender_id = $${params.length + 1}`);
      params.push(sender_id);
    }

    if (message_type) {
      conditions.push(`message_type = $${params.length + 1}`);
      params.push(message_type);
    }

    if (deleted !== undefined) {
      conditions.push(`deleted = $${params.length + 1}`);
      params.push(deleted === "true" || deleted === true);
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
    res.status(500).json({ error: "Error al listar mensajes", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/messages/{id}:
 *   get:
 *     summary: Obtener un mensaje
 *     tags: [Messages]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Mensaje encontrado
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public.messages WHERE id = $1", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Mensaje no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener el mensaje", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/messages:
 *   post:
 *     summary: Crear un mensaje
 *     tags: [Messages]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - conversation_id
 *               - sender_id
 *             properties:
 *               conversation_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *               sender_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174001
 *               message_type:
 *                 type: string
 *                 example: TEXT
 *               message:
 *                 type: string
 *                 example: Hola, ¿cómo estás?
 *               reply_to_message_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174002
 *               edited:
 *                 type: boolean
 *                 example: false
 *               edited_at:
 *                 type: string
 *                 format: date-time
 *               deleted:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       201:
 *         description: Mensaje creado
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeMessagePayload(req.body);

    if (!payload.conversation_id || !payload.sender_id) {
      return res.status(400).json({ error: "conversation_id y sender_id son obligatorios" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear el mensaje", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/messages/{id}:
 *   put:
 *     summary: Actualizar un mensaje
 *     tags: [Messages]
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
 *               message:
 *                 type: string
 *                 example: Mensaje actualizado
 *               edited:
 *                 type: boolean
 *                 example: true
 *               deleted:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Mensaje actualizado
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizeMessagePayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No se proporcionaron campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Mensaje no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar el mensaje", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/messages/{id}:
 *   delete:
 *     summary: Eliminar un mensaje
 *     tags: [Messages]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Mensaje eliminado
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM public.messages WHERE id = $1 RETURNING *", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Mensaje no encontrado" });
    }

    res.json({ message: "Mensaje eliminado correctamente", message: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar el mensaje", details: error.message });
  }
});

module.exports = router;
