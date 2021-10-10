/*jslint browser: true*/
/*global THREE, requestAnimationFrame*/

let camera;

let scene;
let sceneHUD;
let renderer;
let geometry;
let material;
let mesh;
let meshHUD;
let controls;
// Need these to copy current piece from regular scene to HUD
const vector = new THREE.Vector3();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const scale = new THREE.Vector3();

const objects = [];

let raycaster;

const blocker = document.getElementById("blocker");
const instructions = document.getElementById("instructions");

// http://www.html5rocks.com/en/tutorials/pointerlock/intro/

const element = document.body;

const pointerlockchange = () => {
  if (document.pointerLockElement === element) {
    controls.enabled = true;

    blocker.style.display = "none";
  } else {
    controls.enabled = false;

    blocker.style.display = "box";

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
    element.requestPointerLock();
  },
  false
);

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

// Places triHex mesh in front of camera
function makeTriHexMesh() {
  // Simple box for now
  geometry = new THREE.BoxGeometry(2, 2, 2);
  // Doggy texture
  material = new THREE.MeshLambertMaterial({
    map: THREE.ImageUtils.loadTexture("textures/b7e.jpg"),
  });
  // Put them together
  mesh = new THREE.Mesh(geometry, material);
  meshHUD = new THREE.Mesh(geometry, material);

  // Name the HUD mesh so I can access it later
  // Might not be needed if the HUD scene always only has one child
  meshHUD.name = triHexMeshes.length + 1;

  // This keeps getting longer, should have max amount of shots
  // If I limit this array, need to put pieces attached to enemies elsewhere
  triHexMeshes[triHexMeshes.length] = mesh;

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
  geometry = new THREE.PlaneGeometry(200, 200, 1, 1);
  geometry.applyMatrix(new THREE.Matrix4().makeRotationX(-Math.PI / 2));

  material = new THREE.MeshLambertMaterial({
    map: THREE.ImageUtils.loadTexture("textures/b7e.jpg"),
  });

  mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  // objects
  geometry = new THREE.BoxGeometry(20, 20, 20);

  for (i = 0; i < 500; i += 1) {
    mesh = new THREE.Mesh(geometry, material);
    mesh.position.x = Math.floor(Math.random() * 20 - 10) * 20;
    mesh.position.y = Math.floor(Math.random() * 20) * 20 + 10;
    mesh.position.z = Math.floor(Math.random() * 20 - 10) * 20;
    scene.add(mesh);

    material.color.setHSL(
      Math.random() * 0.2 + 0.5,
      0.75,
      Math.random() * 0.25 + 0.75
    );

    objects.push(mesh);
  }

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
var i;
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
  // Get HUD object and regular object
  meshHUD = sceneHUD.getObjectByName(triHexMeshes.length);
  mesh = triHexMeshes[triHexMeshes.length - 1];

  // Get world position
  vector.setFromMatrixPosition(mesh.matrixWorld);
  // Set world position
  meshHUD.position.set(vector.x, vector.y, vector.z);

  // Get world rotation
  mesh.matrixWorld.decompose(position, quaternion, scale);
  // Set world rotation
  meshHUD.quaternion.copy(quaternion);
}

let intersections;

function animate() {
  requestAnimationFrame(animate);

  controls.isOnObject(false);

  raycaster.ray.origin.copy(controls.getObject().position);
  raycaster.ray.origin.y -= 10;

  intersections = raycaster.intersectObjects(objects);

  if (intersections.length > 0) {
    controls.isOnObject(true);
  }

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

  // Detach piece from camera
  THREE.SceneUtils.detach(mesh, camera, scene);
  // Remember to delete the object later

  // Get piece's world position and move back up to center of the screen
  vector.setFromMatrixPosition(mesh.matrixWorld);
  mesh.position.set(vector.x, vector.y + 10, vector.z);

  // Make new one
  makeTriHexMesh();
}

function rotateTriHexMesh(degrees) {
  // Clockwise
  const axis = new THREE.Vector3(0, 0, -1);

  const radians = (degrees * Math.PI) / 180;
  mesh = triHexMeshes[triHexMeshes.length - 1];

  mesh.rotateOnAxis(axis, radians);
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
