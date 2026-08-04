const express = require("express");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./swagger");
const routes = require("./routes");
const { testConnection } = require("./config/postgres");

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    name: "ElectriRent API",
    version: "1.0.0",
    docs: "/api-docs"
  });
});

app.use("/api/v1", routes);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.listen(port, async () => {
  console.log(`ElectriRent API running on http://localhost:${port}`);
  console.log(`Swagger docs available at http://localhost:${port}/api-docs`);

  try {
    await testConnection();
  } catch (error) {
    console.error("PostgreSQL connection failed:", error.message);
  }
});
