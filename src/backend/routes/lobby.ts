import express from "express";

const router = express.Router();

router.get("/", (_request, response) => {
  response.render("lobby", {});
});

export { router as lobbyRoutes };