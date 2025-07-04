import {loadGLTF} from "./libs/loader.js";
const THREE = window.MINDAR.IMAGE.THREE;

document.addEventListener('DOMContentLoaded', () => {
    const start = async() => {
        // #region ------------------- CONFIGURACIÓN DEL JUEGO -------------------
        const gameConfig = {
            // El primer modelo de tacho será el que se muestre inicialmente.
            tachos: [
                { colorName: 'Verde', type: 'reciclable', color: 0x28a745, model: '/static/assets/models/tacho-verde.glb' },
                { colorName: 'Marrón', type: 'organico', color: 0x8B4513, model: '/static/assets/models/tacho-marron.glb' },
                { colorName: 'Rojo', type: 'peligroso', color: 0xdc3545, model: '/static/assets/models/tacho-rojo.glb' },
                { colorName: 'Negro', type: 'no_reciclable', color: 0x343a40, model: '/static/assets/models/tacho-negro.glb' },
            ],
            residuos: [
                { type: 'reciclable', model: '/static/assets/models/papel.glb' },
                { type: 'organico', model: '/static/assets/models/cascara_platano.glb' },
                { type: 'peligroso', model: '/static/assets/models/pila.glb' },
                { type: 'no_reciclable', model: '/static/assets/models/panal.glb' },
            ],
            gameDuration: {
                changeColorInterval: 10, // segundos para cambiar color del tacho
                spawnInterval: 3,       // segundos para generar un nuevo residuo
            },
            fallSpeed: 0.8, // velocidad de caída de los residuos
        };

        let score = 0;
        let activeTachoIndex = 0;
        let clock = new THREE.Clock();
        let timeSinceColorChange = 0;
        let timeSinceSpawn = 0;
        const fallingResiduos = [];
        const loadedModels = { tachos: [], residuos: [] };
        // #endregion

        // #region ------------------- ELEMENTOS HTML (Puntaje y UI) -------------------
        const scoreElement = document.createElement('div');
        scoreElement.style.position = 'fixed';
        scoreElement.style.top = '20px';
        scoreElement.style.left = '20px';
        scoreElement.style.padding = '10px 20px';
        scoreElement.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        scoreElement.style.color = 'white';
        scoreElement.style.fontFamily = 'Arial, sans-serif';
        scoreElement.style.fontSize = '24px';
        scoreElement.style.borderRadius = '10px';
        scoreElement.style.zIndex = '100';
        document.body.appendChild(scoreElement);

        const tachoInfoElement = document.createElement('div');
        tachoInfoElement.style.position = 'fixed';
        tachoInfoElement.style.bottom = '20px';
        tachoInfoElement.style.width = '100%';
        tachoInfoElement.style.textAlign = 'center';
        tachoInfoElement.style.padding = '15px';
        tachoInfoElement.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        tachoInfoElement.style.color = 'white';
        tachoInfoElement.style.fontFamily = 'Arial, sans-serif';
        tachoInfoElement.style.fontSize = '20px';
        tachoInfoElement.style.zIndex = '100';
        document.body.appendChild(tachoInfoElement);

        function updateUI() {
            scoreElement.innerText = `Puntaje: ${score}`;
            const currentTacho = gameConfig.tachos[activeTachoIndex];
            tachoInfoElement.innerText = `Tacho actual: ${currentTacho.colorName} (${currentTacho.type})`;
            tachoInfoElement.style.textShadow = `0 0 10px #${currentTacho.color.toString(16)}`;
        }
        // #endregion

        // #region ------------------- INICIALIZACIÓN DE MINDAR Y THREE.JS -------------------
        const mindarThree = new window.MINDAR.IMAGE.MindARThree({
            container: document.body,
            imageTargetSrc: '/static/assets/targets/targets.mind',
        });
        const { renderer, scene, camera } = mindarThree;
        
        const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1.5);
        scene.add(light);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(0, 10, 5);
        scene.add(directionalLight);

        const anchor = mindarThree.addAnchor(0);
        // #endregion

        // #region ------------------- CARGA DE MODELOS 3D -------------------
        console.log("Cargando modelos...");
        const tachoPromises = gameConfig.tachos.map(t => loadGLTF(t.model));
        const residuoPromises = gameConfig.residuos.map(r => loadGLTF(r.model));

        const [tachoGLTFs, residuoGLTFs] = await Promise.all([
            Promise.all(tachoPromises),
            Promise.all(residuoPromises)
        ]);
        
        tachoGLTFs.forEach((gltf, index) => {
            const tachoModel = gltf.scene;
            tachoModel.scale.set(0.1, 0.1, 0.1); // Ajusta la escala según tu modelo
            tachoModel.position.set(0, -0.4, 0); // Ajusta la posición
            tachoModel.visible = false; // Ocultar todos al inicio
            tachoModel.userData.type = gameConfig.tachos[index].type;
            anchor.group.add(tachoModel);
            loadedModels.tachos.push(tachoModel);
        });

        residuoGLTFs.forEach((gltf, index) => {
            gltf.scene.userData.type = gameConfig.residuos[index].type;
            loadedModels.residuos.push(gltf);
        });
        
        console.log("Modelos cargados exitosamente.");
        loadedModels.tachos[activeTachoIndex].visible = true; // Mostrar el primer tacho
        // #endregion

        // #region ------------------- LÓGICA DEL JUEGO -------------------
        function changeTacho() {
            loadedModels.tachos[activeTachoIndex].visible = false; // Ocultar tacho actual
            activeTachoIndex = (activeTachoIndex + 1) % loadedModels.tachos.length;
            loadedModels.tachos[activeTachoIndex].visible = true; // Mostrar nuevo tacho
            timeSinceColorChange = 0;
            console.log(`Cambiando a tacho: ${gameConfig.tachos[activeTachoIndex].colorName}`);
            updateUI();
        }

        function spawnResiduo() {
            const randomIndex = Math.floor(Math.random() * loadedModels.residuos.length);
            const residuoTemplate = loadedModels.residuos[randomIndex];
            
            const residuo = residuoTemplate.scene.clone();
            residuo.scale.set(0.05, 0.05, 0.05); // Ajusta la escala del residuo
            
            // Posición inicial aleatoria en la parte superior
            residuo.position.set(
                (Math.random() - 0.5) * 1.5, // X: -0.75 a 0.75
                1.5,                          // Y: Arriba
                (Math.random() * -0.5) -0.2   // Z: Ligeramente en frente de la cámara
            );

            residuo.userData.type = residuoTemplate.userData.type; // Copiar el tipo de residuo
            fallingResiduos.push(residuo);
            scene.add(residuo); // Añadir a la escena principal, no al ancla
            timeSinceSpawn = 0;
        }

        function checkCollisions() {
            if (!anchor.visible) return; // No hacer nada si el marcador no se ve

            const tachoActual = loadedModels.tachos[activeTachoIndex];
            const tachoBox = new THREE.Box3().setFromObject(tachoActual);

            for (let i = fallingResiduos.length - 1; i >= 0; i--) {
                const residuo = fallingResiduos[i];
                const residuoBox = new THREE.Box3().setFromObject(residuo);

                if (tachoBox.intersectsBox(residuoBox)) {
                    console.log(`Colisión! Tacho: ${tachoActual.userData.type}, Residuo: ${residuo.userData.type}`);
                    if (tachoActual.userData.type === residuo.userData.type) {
                        score++;
                        console.log("¡Correcto! +1 punto.");
                    } else {
                        score--;
                        console.log("¡Incorrecto! -1 punto.");
                    }
                    
                    // Eliminar residuo de la escena y del array
                    scene.remove(residuo);
                    fallingResiduos.splice(i, 1);
                    updateUI();
                }
            }
        }
        // #endregion

        // #region ------------------- BUCLE PRINCIPAL (ANIMATION LOOP) -------------------
        await mindarThree.start();
        updateUI(); // Llamada inicial para mostrar el estado
        
        renderer.setAnimationLoop(() => {
            const delta = clock.getDelta();
            
            timeSinceColorChange += delta;
            timeSinceSpawn += delta;
            
            // 1. Cambiar color/modelo del tacho periódicamente
            if (timeSinceColorChange >= gameConfig.gameDuration.changeColorInterval) {
                changeTacho();
            }

            // 2. Generar nuevos residuos
            if (timeSinceSpawn >= gameConfig.gameDuration.spawnInterval) {
                spawnResiduo();
            }

            // 3. Animar caída de residuos y eliminarlos si salen de pantalla
            for (let i = fallingResiduos.length - 1; i >= 0; i--) {
                const residuo = fallingResiduos[i];
                residuo.position.y -= gameConfig.fallSpeed * delta;
                residuo.rotation.x += 0.5 * delta;
                residuo.rotation.y += 0.5 * delta;

                if (residuo.position.y < -2) { // Si el objeto sale por abajo
                    scene.remove(residuo);
                    fallingResiduos.splice(i, 1);
                }
            }
            
            // 4. Detectar colisiones
            checkCollisions();

            // 5. Renderizar la escena
            renderer.render(scene, camera);
        });
        // #endregion
    }
    start();
});