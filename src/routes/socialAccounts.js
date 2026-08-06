const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const SOCIAL_ACCOUNT_FIELDS = [
  "user_id",
  "provider",
  "provider_user_id",
  "provider_email",
  "provider_name",
  "provider_picture",
  "access_token",
  "refresh_token",
  "token_expires_at",
  "last_login_at",
  "linked_at",
  "active"
];

function normalizeSocialAccountPayload(body = {}) {
  const payload = {};

  for (const field of SOCIAL_ACCOUNT_FIELDS) {
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
    text: `INSERT INTO public.social_accounts (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.social_accounts SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/social-accounts:
 *   get:
 *     summary: Listar cuentas sociales
 *     tags: [SocialAccounts]
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
 *         example: GOOGLE
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
 *         description: Lista de cuentas sociales
 */
router.get("/", async (req, res) => {
  try {
    const { user_id, provider, active, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.social_accounts";

    if (user_id) {
      conditions.push(`user_id = $${params.length + 1}`);
      params.push(user_id);
    }

    if (provider) {
      conditions.push(`provider = $${params.length + 1}`);
      params.push(provider);
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
    res.status(500).json({ error: "Error al listar cuentas sociales", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/social-accounts/{id}:
 *   get:
 *     summary: Obtener una cuenta social
 *     tags: [SocialAccounts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Cuenta social encontrada
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public.social_accounts WHERE id = $1", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Cuenta social no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener la cuenta social", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/social-accounts:
 *   post:
 *     summary: Crear una cuenta social
 *     tags: [SocialAccounts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *               - provider
 *               - provider_user_id
 *             properties:
 *               user_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *               provider:
 *                 type: string
 *                 example: GOOGLE
 *               provider_user_id:
 *                 type: string
 *                 example: 1020304050
 *               provider_email:
 *                 type: string
 *                 example: user@example.com
 *               provider_name:
 *                 type: string
 *                 example: Usuario
 *               provider_picture:
 *                 type: string
 *                 example: https://example.com/avatar.png
 *               access_token:
 *                 type: string
 *                 example: token123
 *               refresh_token:
 *                 type: string
 *                 example: refresh123
 *               token_expires_at:
 *                 type: string
 *                 format: date-time
 *               last_login_at:
 *                 type: string
 *                 format: date-time
 *               active:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Cuenta social creada
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeSocialAccountPayload(req.body);

    if (!payload.user_id || !payload.provider || !payload.provider_user_id) {
      return res.status(400).json({ error: "user_id, provider y provider_user_id son obligatorios" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear la cuenta social", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/social-accounts/{id}:
 *   put:
 *     summary: Actualizar una cuenta social
 *     tags: [SocialAccounts]
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
 *               provider_email:
 *                 type: string
 *                 example: updated@example.com
 *               provider_name:
 *                 type: string
 *                 example: Usuario Actualizado
 *               active:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Cuenta social actualizada
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizeSocialAccountPayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No hay campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Cuenta social no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar la cuenta social", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/social-accounts/{id}:
 *   delete:
 *     summary: Eliminar una cuenta social
 *     tags: [SocialAccounts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Cuenta social eliminada
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM public.social_accounts WHERE id = $1 RETURNING *", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Cuenta social no encontrada" });
    }

    res.json({ message: "Cuenta social eliminada", data: result.rows[0] });
  } catch (error) {
    res.status(400).json({ error: "Error al eliminar la cuenta social", details: error.message });
  }
});

module.exports = router;
