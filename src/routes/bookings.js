const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const BOOKING_FIELDS = [
  "booking_number",
  "charger_id",
  "driver_id",
  "vehicle_id",
  "host_id",
  "booking_status",
  "reserved_from",
  "reserved_to",
  "estimated_minutes",
  "estimated_kwh",
  "estimated_amount",
  "currency",
  "qr_code",
  "reservation_code",
  "notes",
  "cancelled_reason",
  "cancelled_by"
];

function normalizeBookingPayload(body = {}) {
  const payload = {};

  for (const field of BOOKING_FIELDS) {
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
    text: `INSERT INTO public.bookings (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.bookings SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $${fields.length + 1} AND deleted_at IS NULL RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/bookings:
 *   get:
 *     summary: Listar reservas
 *     tags: [Bookings]
 *     parameters:
 *       - in: query
 *         name: booking_number
 *         schema:
 *           type: string
 *         example: BK-1001
 *       - in: query
 *         name: booking_status
 *         schema:
 *           type: string
 *         example: PENDING
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
 *         description: Lista de reservas
 */
router.get("/", async (req, res) => {
  try {
    const { booking_number, booking_status, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.bookings WHERE deleted_at IS NULL";

    if (booking_number) {
      conditions.push(`booking_number ILIKE $${params.length + 1}`);
      params.push(`%${booking_number}%`);
    }

    if (booking_status) {
      conditions.push(`booking_status = $${params.length + 1}`);
      params.push(booking_status);
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
    res.status(500).json({ error: "Error al listar reservas", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/bookings/{id}:
 *   get:
 *     summary: Obtener una reserva
 *     tags: [Bookings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Reserva encontrada
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM public.bookings WHERE id = $1 AND deleted_at IS NULL",
      [req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Reserva no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener la reserva", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/bookings:
 *   post:
 *     summary: Crear una reserva
 *     tags: [Bookings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - booking_number
 *               - charger_id
 *               - driver_id
 *               - vehicle_id
 *               - host_id
 *               - reserved_from
 *               - reserved_to
 *               - estimated_minutes
 *             properties:
 *               booking_number:
 *                 type: string
 *                 example: BK-1001
 *               charger_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *               driver_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174001
 *               vehicle_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174002
 *               host_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174003
 *               booking_status:
 *                 type: string
 *                 example: PENDING
 *               reserved_from:
 *                 type: string
 *                 format: date-time
 *                 example: 2026-08-10T10:00:00Z
 *               reserved_to:
 *                 type: string
 *                 format: date-time
 *                 example: 2026-08-10T12:00:00Z
 *               estimated_minutes:
 *                 type: integer
 *                 example: 120
 *               estimated_kwh:
 *                 type: number
 *                 example: 45.5
 *               estimated_amount:
 *                 type: number
 *                 example: 125000
 *               currency:
 *                 type: string
 *                 example: COP
 *               qr_code:
 *                 type: string
 *                 example: QR-1001
 *               reservation_code:
 *                 type: string
 *                 example: RES-1001
 *               notes:
 *                 type: string
 *                 example: Reserva para carga rápida
 *               cancelled_reason:
 *                 type: string
 *                 example: Cliente canceló
 *               cancelled_by:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174004
 *     responses:
 *       201:
 *         description: Reserva creada
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeBookingPayload(req.body);

    if (!payload.booking_number || !payload.charger_id || !payload.driver_id || !payload.vehicle_id || !payload.host_id || !payload.reserved_from || !payload.reserved_to || payload.estimated_minutes === undefined) {
      return res.status(400).json({ error: "booking_number, charger_id, driver_id, vehicle_id, host_id, reserved_from, reserved_to y estimated_minutes son obligatorios" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear la reserva", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/bookings/{id}:
 *   put:
 *     summary: Actualizar una reserva
 *     tags: [Bookings]
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
 *               booking_status:
 *                 type: string
 *                 example: CONFIRMED
 *               notes:
 *                 type: string
 *                 example: Reserva confirmada
 *               cancelled_reason:
 *                 type: string
 *                 example: Cancelación por mantenimiento
 *     responses:
 *       200:
 *         description: Reserva actualizada
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizeBookingPayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No se proporcionaron campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Reserva no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar la reserva", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/bookings/{id}:
 *   delete:
 *     summary: Eliminar una reserva
 *     tags: [Bookings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Reserva eliminada
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE public.bookings SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *",
      [req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Reserva no encontrada" });
    }

    res.json({ message: "Reserva eliminada correctamente", booking: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar la reserva", details: error.message });
  }
});

module.exports = router;
