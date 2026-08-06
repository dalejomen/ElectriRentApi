const express = require("express");
const router = express.Router();
const addressesRoutes = require("./addresses");
const bookingHistoryRoutes = require("./bookingHistory");
const bookingsRoutes = require("./bookings");
const chargerConnectorsRoutes = require("./chargerConnectors");
const chargerImagesRoutes = require("./chargerImages");
const chargerPriceRulesRoutes = require("./chargerPriceRules");
const chargerSettingsRoutes = require("./chargerSettings");
const chargerWeeklyScheduleRoutes = require("./chargerWeeklySchedule");
const chargersRoutes = require("./chargers");
const chargingSessionsRoutes = require("./chargingSessions");
const connectorsRoutes = require("./connectors");
const conversationParticipantsRoutes = require("./conversationParticipants");
const conversationsRoutes = require("./conversations");
const favoritesRoutes = require("./favorites");
const hostsRoutes = require("./hosts");
const messageAttachmentsRoutes = require("./messageAttachments");
const messageReadsRoutes = require("./messageReads");
const messagesRoutes = require("./messages");
const paymentMethodsRoutes = require("./paymentMethods");
const paymentsRoutes = require("./payments");
const platformFeeRulesRoutes = require("./platformFeeRules");
const reportDefinitionsRoutes = require("./reportDefinitions");
const reportExecutionsRoutes = require("./reportExecutions");
const reportExportsRoutes = require("./reportExports");

/**
 * @openapi
 * /api/v1/health:
 *   get:
 *     summary: Health check
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: API funcionando correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 service:
 *                   type: string
 */
router.get("/health", (req, res) => {
  res.json({ status: "ok", service: "ElectriRent API" });
});

/**
 * @openapi
 * /api/v1/vehicles:
 *   get:
 *     summary: Listar vehículos
 *     tags: [Vehicles]
 *     responses:
 *       200:
 *         description: Lista de vehículos disponibles
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   model:
 *                     type: string
 *                   chargeLevel:
 *                     type: integer
 */
router.get("/vehicles", (req, res) => {
  res.json([
    { id: "v1", model: "Tesla Model 3", chargeLevel: 85 },
    { id: "v2", model: "Nissan Leaf", chargeLevel: 62 }
  ]);
});

router.use("/addresses", addressesRoutes);
router.use("/booking-history", bookingHistoryRoutes);
router.use("/bookings", bookingsRoutes);
router.use("/charger-connectors", chargerConnectorsRoutes);
router.use("/charger-images", chargerImagesRoutes);
router.use("/charger-price-rules", chargerPriceRulesRoutes);
router.use("/charger-settings", chargerSettingsRoutes);
router.use("/charger-weekly-schedule", chargerWeeklyScheduleRoutes);
router.use("/chargers", chargersRoutes);
router.use("/charging-sessions", chargingSessionsRoutes);
router.use("/connectors", connectorsRoutes);
router.use("/conversation-participants", conversationParticipantsRoutes);
router.use("/conversations", conversationsRoutes);
router.use("/favorites", favoritesRoutes);
router.use("/hosts", hostsRoutes);
router.use("/message-attachments", messageAttachmentsRoutes);
router.use("/message-reads", messageReadsRoutes);
router.use("/messages", messagesRoutes);
router.use("/payment-methods", paymentMethodsRoutes);
router.use("/payments", paymentsRoutes);
router.use("/platform-fee-rules", platformFeeRulesRoutes);
router.use("/report-definitions", reportDefinitionsRoutes);
router.use("/report-executions", reportExecutionsRoutes);
router.use("/report-exports", reportExportsRoutes);

module.exports = router;
