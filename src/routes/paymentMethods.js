const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const PAYMENT_METHOD_FIELDS = [
  "user_id",
  "provider",
  "method_type",
  "token",
  "card_brand",
  "last4",
  "expiration_month",
  "expiration_year",
  "cardholder_name",
  "billing_address_id",
  "is_default",
  "active",
  "verified",
  "provider_customer_id",
  "provider_payment_method_id"
];

function normalizePaymentMethodPayload(body = {}) {
  const payload = {};

  for (const field of PAYMENT_METHOD_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined) {
      payload[field] = body[field];
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "is_default")) {
    payload.is_default = payload.is_default === true || payload.is_default === "true";
  }

  if (Object.prototype.hasOwnProperty.call(payload, "active")) {
    payload.active = payload.active === true || payload.active === "true";
  }

  if (Object.prototype.hasOwnProperty.call(payload, "verified")) {
    payload.verified = payload.verified === true || payload.verified === "true";
  }

  return payload;
}

function buildInsertQuery(payload) {
  const fields = Object.keys(payload);
  const values = fields.map((_, index) => `$${index + 1}`);

  return {
    text: `INSERT INTO public.payment_methods (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.payment_methods SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $${fields.length + 1} AND deleted_at IS NULL RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/payment-methods:
 *   get:
 *     summary: Listar métodos de pago
 *     tags: [PaymentMethods]
 *     parameters:
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *       - in: query
 *         name: provider
 *         schema:
 *           type: string
 *         example: STRIPE
 *       - in: query
 *         name: method_type
 *         schema:
 *           type: string
 *         example: CARD
 *       - in: query
 *         name: is_default
 *         schema:
 *           type: boolean
 *         example: true
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *         example: true
 *       - in: query
 *         name: verified
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
 *         description: Lista de métodos de pago
 */
router.get("/", async (req, res) => {
  try {
    const { user_id, provider, method_type, is_default, active, verified, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.payment_methods WHERE deleted_at IS NULL";

    if (user_id) {
      conditions.push(`user_id = $${params.length + 1}`);
      params.push(user_id);
    }

    if (provider) {
      conditions.push(`provider = $${params.length + 1}`);
      params.push(provider);
    }

    if (method_type) {
      conditions.push(`method_type = $${params.length + 1}`);
      params.push(method_type);
    }

    if (is_default !== undefined) {
      conditions.push(`is_default = $${params.length + 1}`);
      params.push(is_default === "true" || is_default === true);
    }

    if (active !== undefined) {
      conditions.push(`active = $${params.length + 1}`);
      params.push(active === "true" || active === true);
    }

    if (verified !== undefined) {
      conditions.push(`verified = $${params.length + 1}`);
      params.push(verified === "true" || verified === true);
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
    res.status(500).json({ error: "Error al listar métodos de pago", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/payment-methods/{id}:
 *   get:
 *     summary: Obtener un método de pago
 *     tags: [PaymentMethods]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Método de pago encontrado
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public.payment_methods WHERE id = $1 AND deleted_at IS NULL", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Método de pago no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener el método de pago", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/payment-methods:
 *   post:
 *     summary: Crear un método de pago
 *     tags: [PaymentMethods]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *               - provider
 *               - method_type
 *               - token
 *             properties:
 *               user_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *               provider:
 *                 type: string
 *                 example: STRIPE
 *               method_type:
 *                 type: string
 *                 example: CARD
 *               token:
 *                 type: string
 *                 example: tok_123456789
 *               card_brand:
 *                 type: string
 *                 example: Visa
 *               last4:
 *                 type: string
 *                 example: 4242
 *               expiration_month:
 *                 type: integer
 *                 example: 12
 *               expiration_year:
 *                 type: integer
 *                 example: 2028
 *               cardholder_name:
 *                 type: string
 *                 example: John Doe
 *               billing_address_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174001
 *               is_default:
 *                 type: boolean
 *                 example: true
 *               active:
 *                 type: boolean
 *                 example: true
 *               verified:
 *                 type: boolean
 *                 example: false
 *               provider_customer_id:
 *                 type: string
 *                 example: cus_123
 *               provider_payment_method_id:
 *                 type: string
 *                 example: pm_123
 *     responses:
 *       201:
 *         description: Método de pago creado
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizePaymentMethodPayload(req.body);

    if (!payload.user_id || !payload.provider || !payload.method_type || !payload.token) {
      return res.status(400).json({ error: "user_id, provider, method_type y token son obligatorios" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear el método de pago", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/payment-methods/{id}:
 *   put:
 *     summary: Actualizar un método de pago
 *     tags: [PaymentMethods]
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
 *               card_brand:
 *                 type: string
 *                 example: Mastercard
 *               is_default:
 *                 type: boolean
 *                 example: false
 *               active:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Método de pago actualizado
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizePaymentMethodPayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No se proporcionaron campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Método de pago no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar el método de pago", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/payment-methods/{id}:
 *   delete:
 *     summary: Eliminar un método de pago
 *     tags: [PaymentMethods]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Método de pago eliminado
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE public.payment_methods SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *",
      [req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Método de pago no encontrado" });
    }

    res.json({ message: "Método de pago eliminado correctamente", paymentMethod: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar el método de pago", details: error.message });
  }
});

module.exports = router;
