const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const PAYMENT_FIELDS = [
  "payment_number",
  "booking_id",
  "session_id",
  "payer_id",
  "payee_host_id",
  "provider",
  "payment_method",
  "status",
  "currency",
  "subtotal",
  "taxes",
  "service_fee",
  "platform_commission",
  "discount",
  "total",
  "external_transaction_id",
  "authorization_code",
  "provider_response",
  "paid_at",
  "refunded_at"
];

function normalizePaymentPayload(body = {}) {
  const payload = {};

  for (const field of PAYMENT_FIELDS) {
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
    text: `INSERT INTO public.payments (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.payments SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $${fields.length + 1} AND deleted_at IS NULL RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/payments:
 *   get:
 *     summary: Listar pagos
 *     tags: [Payments]
 *     parameters:
 *       - in: query
 *         name: payment_number
 *         schema:
 *           type: string
 *         example: PAY-1001
 *       - in: query
 *         name: booking_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *       - in: query
 *         name: payer_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174001
 *       - in: query
 *         name: payee_host_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174002
 *       - in: query
 *         name: provider
 *         schema:
 *           type: string
 *         example: STRIPE
 *       - in: query
 *         name: payment_method
 *         schema:
 *           type: string
 *         example: CARD
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         example: COMPLETED
 *       - in: query
 *         name: currency
 *         schema:
 *           type: string
 *         example: COP
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
 *         description: Lista de pagos
 */
router.get("/", async (req, res) => {
  try {
    const { payment_number, booking_id, payer_id, payee_host_id, provider, payment_method, status, currency, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.payments WHERE deleted_at IS NULL";

    if (payment_number) {
      conditions.push(`payment_number ILIKE $${params.length + 1}`);
      params.push(`%${payment_number}%`);
    }

    if (booking_id) {
      conditions.push(`booking_id = $${params.length + 1}`);
      params.push(booking_id);
    }

    if (payer_id) {
      conditions.push(`payer_id = $${params.length + 1}`);
      params.push(payer_id);
    }

    if (payee_host_id) {
      conditions.push(`payee_host_id = $${params.length + 1}`);
      params.push(payee_host_id);
    }

    if (provider) {
      conditions.push(`provider = $${params.length + 1}`);
      params.push(provider);
    }

    if (payment_method) {
      conditions.push(`payment_method = $${params.length + 1}`);
      params.push(payment_method);
    }

    if (status) {
      conditions.push(`status = $${params.length + 1}`);
      params.push(status);
    }

    if (currency) {
      conditions.push(`currency = $${params.length + 1}`);
      params.push(currency);
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
    res.status(500).json({ error: "Error al listar pagos", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/payments/{id}:
 *   get:
 *     summary: Obtener un pago
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Pago encontrado
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public.payments WHERE id = $1 AND deleted_at IS NULL", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Pago no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener el pago", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/payments:
 *   post:
 *     summary: Crear un pago
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - payment_number
 *               - booking_id
 *               - payer_id
 *               - payee_host_id
 *               - provider
 *               - payment_method
 *               - total
 *             properties:
 *               payment_number:
 *                 type: string
 *                 example: PAY-1001
 *               booking_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *               session_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174001
 *               payer_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174002
 *               payee_host_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174003
 *               provider:
 *                 type: string
 *                 example: STRIPE
 *               payment_method:
 *                 type: string
 *                 example: CARD
 *               status:
 *                 type: string
 *                 example: PENDING
 *               currency:
 *                 type: string
 *                 example: COP
 *               subtotal:
 *                 type: number
 *                 example: 100000
 *               taxes:
 *                 type: number
 *                 example: 19000
 *               service_fee:
 *                 type: number
 *                 example: 5000
 *               platform_commission:
 *                 type: number
 *                 example: 10000
 *               discount:
 *                 type: number
 *                 example: 0
 *               total:
 *                 type: number
 *                 example: 129000
 *               external_transaction_id:
 *                 type: string
 *                 example: txn_123
 *               authorization_code:
 *                 type: string
 *                 example: auth_123
 *               provider_response:
 *                 type: object
 *                 example: {"status":"succeeded"}
 *               paid_at:
 *                 type: string
 *                 format: date-time
 *               refunded_at:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Pago creado
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizePaymentPayload(req.body);

    if (!payload.payment_number || !payload.booking_id || !payload.payer_id || !payload.payee_host_id || !payload.provider || !payload.payment_method || !payload.total) {
      return res.status(400).json({ error: "payment_number, booking_id, payer_id, payee_host_id, provider, payment_method y total son obligatorios" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear el pago", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/payments/{id}:
 *   put:
 *     summary: Actualizar un pago
 *     tags: [Payments]
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
 *               status:
 *                 type: string
 *                 example: COMPLETED
 *               paid_at:
 *                 type: string
 *                 format: date-time
 *               refunded_at:
 *                 type: string
 *                 format: date-time
 *               provider_response:
 *                 type: object
 *                 example: {"status":"succeeded"}
 *     responses:
 *       200:
 *         description: Pago actualizado
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizePaymentPayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No se proporcionaron campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Pago no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar el pago", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/payments/{id}:
 *   delete:
 *     summary: Eliminar un pago
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Pago eliminado
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE public.payments SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *",
      [req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Pago no encontrado" });
    }

    res.json({ message: "Pago eliminado correctamente", payment: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar el pago", details: error.message });
  }
});

module.exports = router;
