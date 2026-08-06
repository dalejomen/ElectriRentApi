const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const CHARGER_PRICE_RULE_FIELDS = [
  "charger_id",
  "week_day",
  "start_time",
  "end_time",
  "price_type",
  "price",
  "currency"
];

function parseNumericValue(value, fieldName) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName} debe ser un número válido`);
  }

  return parsed;
}

function normalizeChargerPriceRulePayload(body = {}) {
  const payload = {};

  for (const field of CHARGER_PRICE_RULE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined) {
      payload[field] = body[field];
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "price")) {
    payload.price = parseNumericValue(payload.price, "price");
  }

  return payload;
}

function buildInsertQuery(payload) {
  const fields = Object.keys(payload);
  const values = fields.map((_, index) => `$${index + 1}`);

  return {
    text: `INSERT INTO public.charger_price_rules (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.charger_price_rules SET ${assignments.join(", ")} WHERE id = $${fields.length + 1} RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/charger-price-rules:
 *   get:
 *     summary: Listar reglas de precio de cargadores
 *     tags: [ChargerPriceRules]
 *     parameters:
 *       - in: query
 *         name: charger_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *       - in: query
 *         name: price_type
 *         schema:
 *           type: string
 *         example: FLAT
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
 *         description: Lista de reglas de precio de cargadores
 */
router.get("/", async (req, res) => {
  try {
    const { charger_id, price_type, currency, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.charger_price_rules";

    if (charger_id) {
      conditions.push(`charger_id = $${params.length + 1}`);
      params.push(charger_id);
    }

    if (price_type) {
      conditions.push(`price_type = $${params.length + 1}`);
      params.push(price_type);
    }

    if (currency) {
      conditions.push(`currency = $${params.length + 1}`);
      params.push(currency);
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
    res.status(500).json({ error: "Error al listar reglas de precio", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/charger-price-rules/{id}:
 *   get:
 *     summary: Obtener una regla de precio
 *     tags: [ChargerPriceRules]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Regla de precio encontrada
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public.charger_price_rules WHERE id = $1", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Regla de precio no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener la regla de precio", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/charger-price-rules:
 *   post:
 *     summary: Crear una regla de precio
 *     tags: [ChargerPriceRules]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - charger_id
 *               - price_type
 *               - price
 *             properties:
 *               charger_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *               week_day:
 *                 type: string
 *                 example: MONDAY
 *               start_time:
 *                 type: string
 *                 example: 08:00:00
 *               end_time:
 *                 type: string
 *                 example: 20:00:00
 *               price_type:
 *                 type: string
 *                 example: FLAT
 *               price:
 *                 type: number
 *                 example: 1500.00
 *               currency:
 *                 type: string
 *                 example: COP
 *     responses:
 *       201:
 *         description: Regla de precio creada
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeChargerPriceRulePayload(req.body);

    if (!payload.charger_id || !payload.price_type || payload.price === undefined) {
      return res.status(400).json({ error: "charger_id, price_type y price son obligatorios" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear la regla de precio", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/charger-price-rules/{id}:
 *   put:
 *     summary: Actualizar una regla de precio
 *     tags: [ChargerPriceRules]
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
 *               price:
 *                 type: number
 *                 example: 1800.50
 *               price_type:
 *                 type: string
 *                 example: FLAT
 *               currency:
 *                 type: string
 *                 example: COP
 *     responses:
 *       200:
 *         description: Regla de precio actualizada
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizeChargerPriceRulePayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No se proporcionaron campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Regla de precio no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar la regla de precio", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/charger-price-rules/{id}:
 *   delete:
 *     summary: Eliminar una regla de precio
 *     tags: [ChargerPriceRules]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Regla de precio eliminada
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM public.charger_price_rules WHERE id = $1 RETURNING *", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Regla de precio no encontrada" });
    }

    res.json({ message: "Regla de precio eliminada correctamente", chargerPriceRule: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar la regla de precio", details: error.message });
  }
});

module.exports = router;
