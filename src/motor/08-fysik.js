/* =====================================================================
   8. FYSIKVERDEN (cannon-es)
   ===================================================================== */
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -CFG.gravity, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = false;
world.solver.iterations = 12;
world.solver.tolerance = 0.0001;
world.defaultContactMaterial.friction = 0;
world.defaultContactMaterial.restitution = 0;
const MAT_PLAYER = new CANNON.Material('player');
const MAT_WORLD = new CANNON.Material('world');
// Friktion 0: spillerens greb styres af bevægelseskoden (afsnit 11), så is/kridt kan justere det præcist.
world.addContactMaterial(new CANNON.ContactMaterial(MAT_PLAYER, MAT_WORLD, {
  friction: 0, restitution: 0, contactEquationStiffness: 1e8, contactEquationRelaxation: 3,
}));
const G_PLAYER = 1, G_STATIC = 2, G_KINEMATIC = 4;

