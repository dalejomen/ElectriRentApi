const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const WALLET_FIELDS = [
  "user_id",
  "currency",
  "available_balance",
  "pending_balance",
  "blocked_balance",
  "active"
];

function normalizeWalletPayload(body = {}) {
  const payload = {};

  for (const field of WALLET_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined) {
      payload[field] = body[field];
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "active")) {
    payload.active = payload.active === true || payload.active === "true";
  }

  if (Object.prototype.hasOwnProperty.call(payload, "available_balance")) {
    payload.available_balance = Number(payload.available_balance);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "pending_balance")) {
    payload.pending_balance = Number(payload.pending_balance);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "blocked_balance")) {
    payload.blocked_balance = Number(payload.blocked_balance);
  }

  return payload;
}

function buildInsertQuery(payload) {
  const fields = Object.keys(payload);
  const values = fields.map((_, index) => `$${index + 1}`);

  return {
    text: `INSERT INTO public.wallets (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.wallets SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/wallets:
 *   get:
 *     summary: Listar wallets
 *     tags: [Wallets]
 *     parameters:
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *       - in: query
 *         name: currency
 *         schema:
 *           type: string
 *         example: COP
 *       - in: query
 *         name: active
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
 *         description: Lista de wallets
 */
router.get("/", async (req, res) => {
  try {
    const { user_id, currency, active, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.wallets";

    if (user_id) {
      conditions.push(`user_id = $${params.length + 1}`);
      params.push(user_id);
    }

    if (currency) {
      conditions.push(`currency = $${params.length + 1}`);
      params.push(currency);
    }

    if (active !== undefined) {
      conditions.push(`active = $${params.length + 1}`);
      params.push(active === "true" || active === true);
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
    res.status(500).json({ error: "Error al listar wallets", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/wallets/{id}:
 *   get:
 *     summary: Obtener un wallet
 *     tags: [Wallets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Wallet encontrado
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public.wallets WHERE id = $1", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Wallet no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener el wallet", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/wallets:
 *   post:
 *     summary: Crear un wallet
 *     tags: [Wallets]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *               - currency
 *             properties:
 *               user_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *               currency:
 *                 type: string
 *                 example: COP
 *               available_balance:
 *                 type: number
 *                 example: 0
 *               pending_balance:
 *                 type: number
 *                 example: 0
 *               blocked_balance:
 *                 type: number
 *                 example: 0
 *               active:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Wallet creado
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeWalletPayload(req.body);

    if (!payload.user_id || !payload.currency) {
      return res.status(400).json({ error: "user_id y currency son obligatorios" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear el wallet", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/wallets/{id}:
 *   put:
 *     summary: Actualizar un wallet
 *     tags: [Wallets]
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
 *               available_balance:
 *                 type: number
 *                 example: 1000.5
 *               active:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Wallet actualizado
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizeWalletPayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No hay campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Wallet no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar el wallet", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/wallets/{id}:
 *   delete:
 *     summary: Eliminar un wallet
 *     tags: [Wallets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Wallet eliminado
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM public.wallets WHERE id = $1 RETURNING *", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Wallet no encontrado" });
    }

    res.json({ message: "Wallet eliminado", data: result.rows[0] });
  } catch (error) {
    res.status(400).json({ error: "Error al eliminar el wallet", details: error.message });
  }
});

module.exports = router;
