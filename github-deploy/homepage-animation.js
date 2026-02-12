// Homepage Animation Script - Scene Rotation
// Auto-rotate between 3 warehouse scenes

let currentScene = 1;
const totalScenes = 3;
const sceneInterval = 4000; // 4 seconds per scene

function rotateScenes() {
    // Hide all scenes
    document.querySelectorAll('.animation-scene').forEach(scene => {
        scene.classList.remove('active');
    });

    // Show current scene
    const activeScene = document.getElementById(`scene${currentScene}`);
    if (activeScene) {
        activeScene.classList.add('active');
    }

    // Move to next scene
    currentScene++;
    if (currentScene > totalScenes) {
        currentScene = 1;
    }
}

// Start rotation when page loads
document.addEventListener('DOMContentLoaded', function () {
    // Initial scene is already active
    // Start rotating after first interval
    setInterval(rotateScenes, sceneInterval);
});
