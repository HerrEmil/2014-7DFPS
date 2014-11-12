/*global document, window, THREE*/

var camera, scene, renderer;
var geometry, material, mesh;
var controls;

var objects = [];

var raycaster;

var blocker = document.getElementById('blocker');
var instructions = document.getElementById('instructions');

// http://www.html5rocks.com/en/tutorials/pointerlock/intro/

var havePointerLock = 'pointerLockElement' in document ||
                    'mozPointerLockElement' in document ||
                    'webkitPointerLockElement' in document;

if (havePointerLock) {
    var element = document.body;

    var pointerlockchange = function (event) {

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

    var pointerlockerror = function (event) {

        instructions.style.display = '';

    };

    // Hook pointer lock state change events
    document.addEventListener('pointerlockchange', pointerlockchange, false);
    document.addEventListener('mozpointerlockchange', pointerlockchange, false);
    document.addEventListener('webkitpointerlockchange', pointerlockchange, false);

    document.addEventListener('pointerlockerror', pointerlockerror, false);
    document.addEventListener('mozpointerlockerror', pointerlockerror, false);
    document.addEventListener('webkitpointerlockerror', pointerlockerror, false);

    instructions.addEventListener('click', function (event) {

        instructions.style.display = 'none';

        // Ask the browser to lock the pointer
        element.requestPointerLock = element.requestPointerLock ||
                                    element.mozRequestPointerLock ||
                                    element.webkitRequestPointerLock;

        if (/Firefox/i.test(navigator.userAgent)) {

            var fullscreenchange = function (event) {

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

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);

}

var triHexMeshes = [];

// Places trihex mesh in front of camera
function makeTrihexMesh() {
    // Simple box for now
    var geometry = new THREE.BoxGeometry(5, 5, 5),
    // Doggy texture
        material = new THREE.MeshLambertMaterial({
            map: THREE.ImageUtils.loadTexture('textures/b7e.jpg')
        }),
    // Put them together
        mesh = new THREE.Mesh(geometry, material);

    // This keeps getting longer, should have max amount of shots
    // If I limit this array, need to put pieces attached to enemies elsewhere
    triHexMeshes[triHexMeshes.length] = mesh;

    camera.add(mesh);
    // Placing it like this makes you look down on it, no good
    // Ideally, it's not part of the world, it's part of UI
    // Actual piece should fly from center of screen
    mesh.position.set(0, -5, -20);
}

function init() {
    var i, mesh,
        light = new THREE.HemisphereLight(0xeeeeff, 0x777788, 0.75);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 1000);

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xffffff, 0, 750);

    light.position.set(0.5, 1, 0.75);
    scene.add(light);

    controls = new THREE.PointerLockControls(camera);
    scene.add(controls.getObject());

    raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, 10);

    // floor
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

        // material = new THREE.MeshPhongMaterial({
        //     specular: 0xffffff,
        //     shading: THREE.FlatShading,
        //     vertexColors: THREE.VertexColors
        // });

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
    renderer.setClearColor(0xffffff);

    scene.add(makePlatform(
        'models/platform/platform.json',
        'models/platform/platform.jpg',
        renderer.getMaxAnisotropy()
    ));

    renderer.setSize(window.innerWidth, window.innerHeight);

    document.body.appendChild(renderer.domElement);

    window.addEventListener('resize', onWindowResize, false);

}

function animate() {

    requestAnimationFrame(animate);

    controls.isOnObject(false);

    raycaster.ray.origin.copy(controls.getObject().position);
    raycaster.ray.origin.y -= 10;

    var intersections = raycaster.intersectObjects(objects);

    if (intersections.length > 0) {

        controls.isOnObject(true);

    }

    controls.update();

    renderer.render(scene, camera);

}

function shootTrihexMesh() {
    // Detach piece from camera
    THREE.SceneUtils.detach(triHexMeshes[triHexMeshes.length - 1], camera, scene);
    // Set velocity forwards
    // Remember to delete the object later

    // Make new one
    makeTrihexMesh();
}

function degInRad(deg) {
    return deg * Math.PI / 180;
}  

function rotateTrihexMesh() {
    //
    var axis = new THREE.Vector3(0, 0, 1),
        radians = degInRad(-60);
    mesh = triHexMeshes[triHexMeshes.length - 1];

    mesh.rotateOnAxis(axis, radians);
}

// Mouse controls
document.addEventListener('mousedown', function (e) {
    if (e.button === 0) { // if IE<=9, should be 1, but whatevs
        // Shoot current piece
        shootTrihexMesh();
    } else if (e.button === 2) {
        // Rotate current piece
        rotateTrihexMesh();
    }
}, false);

init();
animate();