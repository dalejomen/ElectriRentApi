const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const BOOKING_HISTORY_FIELDS = [
  "booking_id",
  "previous_status",
  "new_status",
  "changed_by",
  "change_reason",
  "comments",
  "ip_address",
  "user_agent"
];

function normalizeBookingHistoryPayload(body = {}) {
  const payload = {};

  for (const field of BOOKING_HISTORY_FIELDS) {
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
    text: `INSERT INTO public.booking_history (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.booking_history SET ${assignments.join(", ")} WHERE id = $${fields.length + 1} RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/booking-history:
 *   get:
 *     summary: Listar historial de reservas
 *     tags: [BookingHistory]
 *     parameters:
 *       - in: query
 *         name: booking_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *       - in: query
 *         name: changed_by
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174001
 *       - in: query
 *         name: new_status
 *         schema:
 *           type: string
 *         example: confirmed
 *       - in: query
 *         name: previous_status
 *         schema:
 *           type: string
 *         example: pending
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
 *         description: Lista de registros de historial de reservas
 */
router.get("/", async (req, res) => {
  try {
    const { booking_id, changed_by, new_status, previous_status, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.booking_history";

    if (booking_id) {
      conditions.push(`booking_id = $${params.length + 1}`);
      params.push(booking_id);
    }

    if (changed_by) {
      conditions.push(`changed_by = $${params.length + 1}`);
      params.push(changed_by);
    }

    if (new_status) {
      conditions.push(`new_status = $${params.length + 1}`);
      params.push(new_status);
    }

    if (previous_status) {
      conditions.push(`previous_status = $${params.length + 1}`);
      params.push(previous_status);
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
    res.status(500).json({ error: "Error al listar historial de reservas", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/booking-history/{id}:
 *   get:
 *     summary: Obtener un registro de historial de reserva
 *     tags: [BookingHistory]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Registro encontrado
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public.booking_history WHERE id = $1", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Registro de historial no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener el registro", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/booking-history:
 *   post:
 *     summary: Crear un registro de historial de reserva
 *     tags: [BookingHistory]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - booking_id
 *               - new_status
 *             properties:
 *               booking_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *               previous_status:
 *                 type: string
 *                 example: pending
 *               new_status:
 *                 type: string
 *                 example: confirmed
 *               changed_by:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174001
 *               change_reason:
 *                 type: string
 *                 example: Reserva confirmada por el cliente
 *               comments:
 *                 type: string
 *                 example: Se actualizó el estado de la reserva
 *               ip_address:
 *                 type: string
 *                 example: 127.0.0.1
 *               user_agent:
 *                 type: string
 *                 example: Mozilla/5.0
 *     responses:
 *       201:
 *         description: Registro creado
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeBookingHistoryPayload(req.body);

    if (!payload.booking_id || !payload.new_status) {
      return res.status(400).json({ error: "booking_id y new_status son obligatorios" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear el registro", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/booking-history/{id}:
 *   put:
 *     summary: Actualizar un registro de historial de reserva
 *     tags: [BookingHistory]
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
 *               new_status:
 *                 type: string
 *                 example: canceled
 *               change_reason:
 *                 type: string
 *                 example: Cancelación solicitada por el cliente
 *               comments:
 *                 type: string
 *                 example: Se registró la cancelación
 *     responses:
 *       200:
 *         description: Registro actualizado
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizeBookingHistoryPayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No se proporcionaron campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Registro de historial no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar el registro", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/booking-history/{id}:
 *   delete:
 *     summary: Eliminar un registro de historial de reserva
 *     tags: [BookingHistory]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Registro eliminado
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM public.booking_history WHERE id = $1 RETURNING *", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Registro de historial no encontrado" });
    }

    res.json({ message: "Registro eliminado correctamente", bookingHistory: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar el registro", details: error.message });
  }
});

module.exports = router;
