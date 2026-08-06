const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const PLATFORM_FEE_RULE_FIELDS = [
  "name",
  "description",
  "fee_type",
  "percentage",
  "fixed_amount",
  "minimum_fee",
  "maximum_fee",
  "currency",
  "effective_from",
  "effective_to",
  "active"
];

function normalizePlatformFeeRulePayload(body = {}) {
  const payload = {};

  for (const field of PLATFORM_FEE_RULE_FIELDS) {
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
    text: `INSERT INTO public.platform_fee_rules (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.platform_fee_rules SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/platform-fee-rules:
 *   get:
 *     summary: Listar reglas de comisiones
 *     tags: [PlatformFeeRules]
 *     parameters:
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         example: Plataforma premium
 *       - in: query
 *         name: fee_type
 *         schema:
 *           type: string
 *         example: PERCENTAGE
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
 *         description: Lista de reglas de comisiones
 */
router.get("/", async (req, res) => {
  try {
    const { name, fee_type, currency, active, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.platform_fee_rules";

    if (name) {
      conditions.push(`name ILIKE $${params.length + 1}`);
      params.push(`%${name}%`);
    }

    if (fee_type) {
      conditions.push(`fee_type = $${params.length + 1}`);
      params.push(fee_type);
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
    res.status(500).json({ error: "Error al listar reglas de comisiones", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/platform-fee-rules/{id}:
 *   get:
 *     summary: Obtener una regla de comisión
 *     tags: [PlatformFeeRules]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Regla encontrada
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public.platform_fee_rules WHERE id = $1", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Regla no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener la regla", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/platform-fee-rules:
 *   post:
 *     summary: Crear una regla de comisión
 *     tags: [PlatformFeeRules]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - fee_type
 *               - effective_from
 *             properties:
 *               name:
 *                 type: string
 *                 example: Comisión premium
 *               description:
 *                 type: string
 *                 example: Comisión para hosts premium
 *               fee_type:
 *                 type: string
 *                 example: PERCENTAGE
 *               percentage:
 *                 type: number
 *                 example: 5
 *               fixed_amount:
 *                 type: number
 *                 example: 1000
 *               minimum_fee:
 *                 type: number
 *                 example: 500
 *               maximum_fee:
 *                 type: number
 *                 example: 20000
 *               currency:
 *                 type: string
 *                 example: COP
 *               effective_from:
 *                 type: string
 *                 format: date-time
 *                 example: 2026-08-05T00:00:00Z
 *               effective_to:
 *                 type: string
 *                 format: date-time
 *                 example: 2026-12-31T23:59:59Z
 *               active:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Regla creada
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizePlatformFeeRulePayload(req.body);

    if (!payload.name || !payload.fee_type || !payload.effective_from) {
      return res.status(400).json({ error: "name, fee_type y effective_from son obligatorios" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear la regla", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/platform-fee-rules/{id}:
 *   put:
 *     summary: Actualizar una regla de comisión
 *     tags: [PlatformFeeRules]
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
 *               name:
 *                 type: string
 *                 example: Regla actualizada
 *               fee_type:
 *                 type: string
 *                 example: FIXED
 *               active:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Regla actualizada
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizePlatformFeeRulePayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No se proporcionaron campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Regla no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar la regla", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/platform-fee-rules/{id}:
 *   delete:
 *     summary: Eliminar una regla de comisión
 *     tags: [PlatformFeeRules]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Regla eliminada
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM public.platform_fee_rules WHERE id = $1 RETURNING *", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Regla no encontrada" });
    }

    res.json({ message: "Regla eliminada correctamente", platformFeeRule: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar la regla", details: error.message });
  }
});

module.exports = router;
