/*jslint browser: true*/
/*global THREE, requestAnimationFrame*/

let camera;
let scene;
let sceneHUD;
let renderer;
let mesh;
let meshHUD;
let controls;
// decompose() needs a scale target; the HUD copy only uses position and rotation
const scale = new THREE.Vector3();

const objects = [];

let raycaster;

const blocker = document.getElementById("blocker");
const instructions = document.getElementById("instructions");

// http://www.html5rocks.com/en/tutorials/pointerlock/intro/

const pointerlockchange = () => {
  if (document.pointerLockElement === document.body) {
    controls.enabled = true;

    blocker.style.display = "none";
  } else {
    controls.enabled = false;

    blocker.style.display = "";

    instructions.style.display = "";
  }
};

const pointerlockerror = () => {
  instructions.style.display = "";
};

// Hook pointer lock state change events
document.addEventListener("pointerlockchange", pointerlockchange, false);
document.addEventListener("pointerlockerror", pointerlockerror, false);

instructions.addEventListener(
  "click",
  () => {
    instructions.style.display = "none";
    // Ask the browser to lock the pointer
    document.body.requestPointerLock();
  },
  false
);

// Doggy texture, shared by the floor, the boxes and the triHex pieces
const doggyTexture = THREE.ImageUtils.loadTexture("textures/b7e.jpg");

// Loading 3D model, from misc FPS example
function makePlatform(jsonUrl, textureUrl, textureQuality) {
  const placeholder = new THREE.Object3D();
  const texture = THREE.ImageUtils.loadTexture(textureUrl);
  const loader = new THREE.JSONLoader();

  texture.anisotropy = textureQuality;

  loader.load(jsonUrl, (platformGeometry) => {
    platformGeometry.computeFaceNormals();

    const platform = new THREE.Mesh(
      platformGeometry,
      new THREE.MeshBasicMaterial({ map: texture })
    );

    platform.name = "platform";

    placeholder.add(platform);
  });

  // translateX, translateY, translateZ to move model by distance
  placeholder.translateY(1);

  return placeholder;
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

const triHexMeshes = [];

// Simple box for now — every piece shares this one geometry and material
const triHexGeometry = new THREE.BoxGeometry(2, 2, 2);
const triHexMaterial = new THREE.MeshLambertMaterial({ map: doggyTexture });

// Places triHex mesh in front of camera
function makeTriHexMesh() {
  mesh = new THREE.Mesh(triHexGeometry, triHexMaterial);
  meshHUD = new THREE.Mesh(triHexGeometry, triHexMaterial);

  // This keeps getting longer, should have max amount of shots
  // If I limit this array, need to put pieces attached to enemies elsewhere
  triHexMeshes.push(mesh);

  // Remove previous HUD piece, add new one, don't remove first child (which is light)
  if (sceneHUD.children.length !== 1) {
    sceneHUD.remove(sceneHUD.children[sceneHUD.children.length - 1]);
  }
  sceneHUD.add(meshHUD);

  camera.add(mesh);
  // Placing it like this makes you look down on it, no good
  // Ideally, it's not part of the world, it's part of UI
  // Actual piece should fly from center of screen
  mesh.position.set(0, -10, -20);
}

function init() {
  const light = new THREE.HemisphereLight(0xeeeeff, 0x777788, 0.75);
  const lightHUD = new THREE.HemisphereLight(0xeeeeff, 0x777788, 0.75);

  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    1,
    1000
  );

  scene = new THREE.Scene();
  sceneHUD = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffffff, 0, 750);

  light.position.set(0.5, 1, 0.75);
  scene.add(light);

  lightHUD.position.set(0.5, 1, 0.75);
  sceneHUD.add(lightHUD);

  controls = new THREE.PointerLockControls(camera);
  scene.add(controls.getObject());

  raycaster = new THREE.Raycaster(
    new THREE.Vector3(),
    new THREE.Vector3(0, -1, 0),
    0,
    10
  );

  // floor
  // THREE.PlaneGeometry: Consider using THREE.PlaneBufferGeometry for lower memory footprint.
  // Changing to PlaneBufferGeometry causes:
  // [.WebGLRenderingContext]GL ERROR :GL_INVALID_OPERATION : glDrawElements: range out of bounds for buffer
  let geometry = new THREE.PlaneGeometry(200, 200, 1, 1);
  geometry.applyMatrix(new THREE.Matrix4().makeRotationX(-Math.PI / 2));

  const material = new THREE.MeshLambertMaterial({ map: doggyTexture });

  scene.add(new THREE.Mesh(geometry, material));

  // objects
  geometry = new THREE.BoxGeometry(20, 20, 20);

  for (let i = 0; i < 500; i += 1) {
    const box = new THREE.Mesh(geometry, material);
    box.position.x = Math.floor(Math.random() * 20 - 10) * 20;
    box.position.y = Math.floor(Math.random() * 20) * 20 + 10;
    box.position.z = Math.floor(Math.random() * 20 - 10) * 20;
    scene.add(box);

    objects.push(box);
  }

  // The floor and all boxes share one material, so a single tint colors everything
  material.color.setHSL(
    Math.random() * 0.2 + 0.5,
    0.75,
    Math.random() * 0.25 + 0.75
  );

  // Object placed in front of camera
  makeTriHexMesh();

  renderer = new THREE.WebGLRenderer();
  renderer.setClearColor(0x7fdbff);
  renderer.autoClear = false;

  scene.add(
    makePlatform(
      "models/platform/platform.json",
      "models/platform/platform.jpg",
      renderer.getMaxAnisotropy()
    )
  );

  renderer.setSize(window.innerWidth, window.innerHeight);

  document.body.appendChild(renderer.domElement);

  window.addEventListener("resize", onWindowResize, false);
}

let i;
let allButLast;

function updateTriHexPositions() {
  allButLast = triHexMeshes.length - 1;
  // For each triHex except the last one (which is the one you're holding)
  for (i = 0; i < allButLast; i += 1) {
    // Should take time delta instead of constant
    triHexMeshes[i].translateZ(-1);
  }
}

function updateHUD() {
  mesh = triHexMeshes[triHexMeshes.length - 1];

  // Copy world position and rotation from the held piece to its HUD twin
  mesh.matrixWorld.decompose(meshHUD.position, meshHUD.quaternion, scale);
}

function animate() {
  requestAnimationFrame(animate);

  raycaster.ray.origin.copy(controls.getObject().position);
  raycaster.ray.origin.y -= 10;

  controls.isOnObject(raycaster.intersectObjects(objects).length > 0);

  updateTriHexPositions();

  controls.update();

  renderer.clear();
  renderer.render(scene, camera);

  updateHUD();

  // Piece in hand in its own "hud" scene, rendered on top of everything else
  renderer.clearDepth();
  renderer.render(sceneHUD, camera);
}

function shootTriHexMesh() {
  mesh = triHexMeshes[triHexMeshes.length - 1];

  // Detach piece from camera; detach leaves mesh.position in world coordinates
  THREE.SceneUtils.detach(mesh, camera, scene);
  // Remember to delete the object later

  // Move back up to center of the screen
  mesh.position.y += 10;

  // Make new one
  makeTriHexMesh();
}

function rotateTriHexMesh(degrees) {
  mesh = triHexMeshes[triHexMeshes.length - 1];

  // Clockwise
  mesh.rotateZ(-THREE.Math.degToRad(degrees));
}

// Mouse controls
document.addEventListener(
  "mousedown",
  ({ button }) => {
    if (button === 0) {
      // Shoot current piece
      shootTriHexMesh();
    } else if (button === 2) {
      // Rotate current piece by degrees
      rotateTriHexMesh(60);
    }
  },
  false
);

init();
animate();
