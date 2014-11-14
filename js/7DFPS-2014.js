/*jslint browser: true*/
/*global THREE, requestAnimationFrame*/

var camera, scene, sceneHUD, renderer;
var geometry, material, mesh, meshHUD;
var controls;

var objects = [];

var raycaster;

var blocker = document.getElementById('blocker');
var instructions = document.getElementById('instructions');

// http://www.html5rocks.com/en/tutorials/pointerlock/intro/

// jslint says no
// var havePointerLock = 'pointerLockElement' in document ||
//                     'mozPointerLockElement' in document ||
//                     'webkitPointerLockElement' in document;

// Firefox says no
// var havePointerLock = document.hasOwnProperty('pointerLockElement') ||
//                     document.hasOwnProperty('mozPointerLockElement') ||
//                     document.hasOwnProperty('webkitPointerLockElement');

// Success!
var havePointerLock = document.pointerLockElement !== undefined ||
                        document.mozPointerLockElement !== undefined ||
                        document.webkitPointerLockElement !== undefined;

if (havePointerLock) {
    var element = document.body;

    var pointerlockchange = function () {
        'use strict';

        if (document.pointerLockElement === element ||
                document.mozPointerLockElement === element ||
                document.webkitPointerLockElement === element) {

            controls.enabled = true;

            blocker.style.display = 'none';

        } else {

            controls.enabled = false;

            blocker.style.display = '-webkit-box';
            blocker.style.display = '-moz-box';
            blocker.style.display = 'box';

            instructions.style.display = '';

        }

    };

    var pointerlockerror = function () {
        'use strict';

        instructions.style.display = '';

    };

    // Hook pointer lock state change events
    document.addEventListener('pointerlockchange', pointerlockchange, false);
    document.addEventListener('mozpointerlockchange', pointerlockchange, false);
    document.addEventListener('webkitpointerlockchange', pointerlockchange, false);

    document.addEventListener('pointerlockerror', pointerlockerror, false);
    document.addEventListener('mozpointerlockerror', pointerlockerror, false);
    document.addEventListener('webkitpointerlockerror', pointerlockerror, false);

    instructions.addEventListener('click', function () {
        'use strict';

        instructions.style.display = 'none';

        // Ask the browser to lock the pointer
        element.requestPointerLock = element.requestPointerLock ||
                                    element.mozRequestPointerLock ||
                                    element.webkitRequestPointerLock;

        if (/Firefox/i.test(navigator.userAgent)) {

            var fullscreenchange = function () {

                if (document.fullscreenElement === element ||
                        document.mozFullscreenElement === element ||
                        document.mozFullScreenElement === element) {

                    document.removeEventListener('fullscreenchange', fullscreenchange);
                    document.removeEventListener('mozfullscreenchange', fullscreenchange);

                    element.requestPointerLock();
                }

            };

            document.addEventListener('fullscreenchange', fullscreenchange, false);
            document.addEventListener('mozfullscreenchange', fullscreenchange, false);

            element.requestFullscreen = element.requestFullscreen ||
                                        element.mozRequestFullscreen ||
                                        element.mozRequestFullScreen ||
                                        element.webkitRequestFullscreen;

            element.requestFullscreen();

        } else {

            element.requestPointerLock();

        }

    }, false);

} else {

    instructions.innerHTML = 'Your browser doesn\'t seem to support Pointer Lock API';

}

// Loading 3D model, from misc FPS example
function makePlatform(jsonUrl, textureUrl, textureQuality) {
    'use strict';
    var placeholder = new THREE.Object3D(),
        texture = THREE.ImageUtils.loadTexture(textureUrl),
        loader = new THREE.JSONLoader();

    texture.anisotropy = textureQuality;

    loader.load(jsonUrl, function (geometry) {

        geometry.computeFaceNormals();

        var platform = new THREE.Mesh(geometry,
            new THREE.MeshBasicMaterial({ map : texture }));

        platform.name = "platform";

        placeholder.add(platform);
    });

    // translatex, translateY, translateZ to move model by distance
    placeholder.translateY(1);

    return placeholder;
}

function onWindowResize() {
    'use strict';

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);

}

var triHexMeshes = [];

// Places trihex mesh in front of camera
function makeTrihexMesh() {
    'use strict';
    // Simple box for now
    var geometry = new THREE.BoxGeometry(5, 5, 5),
    // Doggy texture
        material = new THREE.MeshLambertMaterial({
            map: THREE.ImageUtils.loadTexture('textures/b7e.jpg')
        }),
    // Put them together
        mesh = new THREE.Mesh(geometry, material),
        meshHUD = new THREE.Mesh(geometry, material);

    // Name the HUD mesh so I can access it later
    // Might not be needed if the HUD scene always only has one child
    meshHUD.name = (triHexMeshes.length + 1);

    // This keeps getting longer, should have max amount of shots
    // If I limit this array, need to put pieces attached to enemies elsewhere
    triHexMeshes[triHexMeshes.length] = mesh;

    // Remove previous HUD piece, add new one
    sceneHUD.remove(sceneHUD.children[sceneHUD.children.length - 1]);
    sceneHUD.add(meshHUD);

    camera.add(mesh);
    // Placing it like this makes you look down on it, no good
    // Ideally, it's not part of the world, it's part of UI
    // Actual piece should fly from center of screen
    mesh.position.set(0, 0, -20);
}

function init() {
    'use strict';
    var i, mesh,
        light = new THREE.HemisphereLight(0xeeeeff, 0x777788, 0.75);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 1000);

    scene = new THREE.Scene();
    sceneHUD = new THREE.Scene();
    scene.fog = new THREE.Fog(0xffffff, 0, 750);

    light.position.set(0.5, 1, 0.75);
    scene.add(light);

    controls = new THREE.PointerLockControls(camera);
    scene.add(controls.getObject());

    raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, 10);

    // floor
    // THREE.PlaneGeometry: Consider using THREE.PlaneBufferGeometry for lower memory footprint.
    // Changing to PlaneBufferGeometry causes:
    // [.WebGLRenderingContext]GL ERROR :GL_INVALID_OPERATION : glDrawElements: range out of bounds for buffer 
    geometry = new THREE.PlaneGeometry(200, 200, 1, 1);
    geometry.applyMatrix(new THREE.Matrix4().makeRotationX(-Math.PI / 2));

    material = new THREE.MeshLambertMaterial({
        map: THREE.ImageUtils.loadTexture('textures/b7e.jpg')
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


        material.color.setHSL(Math.random() * 0.2 + 0.5, 0.75, Math.random() * 0.25 + 0.75);

        objects.push(mesh);

    }

    // Object placed in front of camera
    makeTrihexMesh();


    renderer = new THREE.WebGLRenderer();
    renderer.setClearColor(0x7FDBFF);
    renderer.autoClear = false;


    scene.add(makePlatform(
        'models/platform/platform.json',
        'models/platform/platform.jpg',
        renderer.getMaxAnisotropy()
    ));

    renderer.setSize(window.innerWidth, window.innerHeight);

    document.body.appendChild(renderer.domElement);

    window.addEventListener('resize', onWindowResize, false);

}

function updateTrihexPositions() {
    'use strict';
    var i,
        allButLast = triHexMeshes.length - 1;
    // For each trihex except the last one
    for (i = 0; i < allButLast; i += 1) {
        // Should take time delta instead of constant
        triHexMeshes[i].translateZ(-1);
    }
}

function updateHUD() {
    'use strict';
    // Get world position of actual piece
    var vector = new THREE.Vector3();
    vector.setFromMatrixPosition(triHexMeshes[triHexMeshes.length - 1].matrixWorld);
    //console.log(vector);
    meshHUD = sceneHUD.getObjectByName(triHexMeshes.length);
    meshHUD.position.set(vector.x, vector.y, vector.z);
}

function animate() {
    'use strict';

    requestAnimationFrame(animate);

    controls.isOnObject(false);

    raycaster.ray.origin.copy(controls.getObject().position);
    raycaster.ray.origin.y -= 10;

    var intersections = raycaster.intersectObjects(objects);

    if (intersections.length > 0) {

        controls.isOnObject(true);

    }

    updateTrihexPositions();

    controls.update();

    renderer.clear();
    renderer.render(scene, camera);

    // var lastMesh = triHexMeshes[triHexMeshes.length - 1];
    // THREE.SceneUtils.detach(lastMesh, camera, scene);
    // sceneHUD.add(lastMesh);
    updateHUD();

    // Piece in hand in its own "hud" scene, rendered on top of everything else
    renderer.clearDepth();
    renderer.render(sceneHUD, camera);

}

function shootTrihexMesh() {
    'use strict';
    var lastMesh = triHexMeshes[triHexMeshes.length - 1];

    // Detach piece from camera
    THREE.SceneUtils.detach(lastMesh, camera, scene);
    // Remember to delete the object later

    // If I display the piece in hand below center,
    // I have to remember to put it back up before it starts animating
    // lastMesh.translateY(15);


    // Make new one
    makeTrihexMesh();
}

function rotateTrihexMesh(degrees) {
    'use strict';
    // Clockwise
    var axis = new THREE.Vector3(0, 0, -1),
        radians = degrees * Math.PI / 180;
    mesh = triHexMeshes[triHexMeshes.length - 1];

    mesh.rotateOnAxis(axis, radians);
}

// Mouse controls
document.addEventListener('mousedown', function (e) {
    'use strict';
    if (e.button === 0) { // if IE<=9, should be 1, but whatevs
        // Shoot current piece
        shootTrihexMesh();
    } else if (e.button === 2) {
        // Rotate current piece by degrees
        rotateTrihexMesh(60);
    }
}, false);

init();
animate();