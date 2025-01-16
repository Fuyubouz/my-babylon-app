// components/BabylonScene.tsx
'use client';

import React, { useEffect, useRef } from 'react';
import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders';
import '@babylonjs/gui';
import { AdvancedDynamicTexture, TextBlock, Control } from '@babylonjs/gui';
import HavokPhysics from "@babylonjs/havok";
import { SkyMaterial } from "@babylonjs/materials";

const BabylonScene: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraFirstPosition = new BABYLON.Vector3(3, 1.6, 4);
  const cupsuleFirstPosition = new BABYLON.Vector3(3, 1, 3);
  const headOffset = new BABYLON.Vector3(0, 0.6, 0);
  useEffect(() => {
    if (!canvasRef.current) return;

    // Babylon.js エンジンとシーンの初期化
    const engine = new BABYLON.Engine(canvasRef.current, true);
    const scene = new BABYLON.Scene(engine);
    // async 関数内で HavokPhysics の await を使う
    const initScene = async () => {
      // Initialize Havok plugin
      const havokInstance = await HavokPhysics();//#1 error:'await' expressions are only allowed within async functions and at the top levels of modules.ts(1308)
      const havok = new BABYLON.HavokPlugin(false, havokInstance);
      // Enable physics in the scene with a gravity
      scene.enablePhysics(new BABYLON.Vector3(0, -9.8, 0), havok);
      // ファーストパーソンカメラの設定
      const camera = new BABYLON.UniversalCamera(
        'FirstPersonCamera',
        cameraFirstPosition, // 初期位置
        scene
      );
      console.log('camera=', camera);
      //console.log('camera.minZ=', camera.minZ);
      camera.fov = 1.1;
      camera.minZ = 0.2;
      //キャラクターの設定
      var state: string | null | undefined = "IN_AIR";
      var inAirSpeed = 3.0;
      var onGroundSpeed = 5.0;
      var jumpHeight = 0.6;
      let wantJump = false;
      let inputDirection = new BABYLON.Vector3(0, 0, 0);
      let rotateDirection = 0;
      var forwardLocalSpace = new BABYLON.Vector3(0, 0, 1);
      let characterOrientation = BABYLON.Quaternion.Identity();
      let characterGravity = new BABYLON.Vector3(0, -5, 0);
      const cameraAngularSpeed = 0.01;
      // Physics shape for the character
      let h = 1.2;
      let r = 0.15;
      let displayCapsule = BABYLON.MeshBuilder.CreateCapsule("CharacterDisplay", { height: h, radius: r }, scene);
      let characterPosition = cupsuleFirstPosition.clone();
      let headPosition = cupsuleFirstPosition.clone().addInPlace(headOffset);
      let characterController = new BABYLON.PhysicsCharacterController(characterPosition, { capsuleHeight: h, capsuleRadius: r }, scene);
      displayCapsule.visibility = 0.1;
      //camera.setTarget(characterPosition);
      //camera.setTarget(headPosition);

      // シーン初期化時に固定の水平距離を決める（例：初期カメラ位置とキャラクターの水平距離）
      const initOffset = camera.position.subtract(displayCapsule.position);
      initOffset.y = 0; // 水平成分のみ
      const fixedHorizontalDistance = initOffset.length();


      // State handling
      // depending on character state and support, set the new state
      const getNextState = function (supportInfo: BABYLON.CharacterSurfaceInfo) {
        if (state == "IN_AIR") {
          if (supportInfo.supportedState == BABYLON.CharacterSupportedState.SUPPORTED) {
            return "ON_GROUND";
          }
          return "IN_AIR";
        } else if (state == "ON_GROUND") {
          if (supportInfo.supportedState != BABYLON.CharacterSupportedState.SUPPORTED) {
            return "IN_AIR";
          }
          if (wantJump) {
            return "START_JUMP";
          }
          return "ON_GROUND";
        } else if (state == "START_JUMP") {
          return "IN_AIR";
        }
      }

      // From aiming direction and state, compute a desired velocity
      // That velocity depends on current state (in air, on ground, jumping, ...) and surface properties
      const getDesiredVelocity = function (
        deltaTime: number,
        supportInfo: BABYLON.CharacterSurfaceInfo,
        characterOrientation: BABYLON.Quaternion,
        currentVelocity: BABYLON.Vector3
      ) {
        let nextState = getNextState(supportInfo);
        if (nextState != state) {
          state = nextState;
          console.log('state=', state);
        }
        let upWorld = characterGravity.normalizeToNew();
        upWorld.scaleInPlace(-1.0);
        let forwardWorld = forwardLocalSpace.applyRotationQuaternion(characterOrientation);
        if (state == "IN_AIR") {
          let desiredVelocity = inputDirection.scale(inAirSpeed).applyRotationQuaternion(characterOrientation);
          let outputVelocity = characterController.calculateMovement(deltaTime, forwardWorld, upWorld, currentVelocity, BABYLON.Vector3.ZeroReadOnly, desiredVelocity, upWorld);
          // Restore to original vertical component
          outputVelocity.addInPlace(upWorld.scale(-outputVelocity.dot(upWorld)));
          outputVelocity.addInPlace(upWorld.scale(currentVelocity.dot(upWorld)));
          // Add gravity
          outputVelocity.addInPlace(characterGravity.scale(deltaTime));
          return outputVelocity;
        } else if (state == "ON_GROUND") {
          // Move character relative to the surface we're standing on
          // Correct input velocity to apply instantly any changes in the velocity of the standing surface and this way
          // avoid artifacts caused by filtering of the output velocity when standing on moving objects.
          let desiredVelocity = inputDirection.scale(onGroundSpeed).applyRotationQuaternion(characterOrientation);
          let outputVelocity = characterController.calculateMovement(deltaTime, forwardWorld, supportInfo.averageSurfaceNormal, currentVelocity, supportInfo.averageSurfaceVelocity, desiredVelocity, upWorld);
          // Horizontal projection
          {
            outputVelocity.subtractInPlace(supportInfo.averageSurfaceVelocity);
            let inv1k = 1e-3;
            if (outputVelocity.dot(upWorld) > inv1k) {
              let velLen = outputVelocity.length();
              outputVelocity.normalizeFromLength(velLen);

              // Get the desired length in the horizontal direction
              let horizLen = velLen / supportInfo.averageSurfaceNormal.dot(upWorld);

              // Re project the velocity onto the horizontal plane
              let c = supportInfo.averageSurfaceNormal.cross(outputVelocity);
              outputVelocity = c.cross(upWorld);
              outputVelocity.scaleInPlace(horizLen);
            }
            outputVelocity.addInPlace(supportInfo.averageSurfaceVelocity);
            return outputVelocity;
          }
        } else if (state == "START_JUMP") {
          let u = Math.sqrt(2 * characterGravity.length() * jumpHeight);
          let curRelVel = currentVelocity.dot(upWorld);
          return currentVelocity.add(upWorld.scale(u - curRelVel));
        }
        return BABYLON.Vector3.Zero();
      }

      // Display tick update: compute new camera position/target, update the capsule for the character display
      scene.onBeforeRenderObservable.add((scene) => {
        // キャラクター表示用カプセルの位置を物理キャラクターコントローラーの現在の位置に合わせる
        displayCapsule.position.copyFrom(characterController.getPosition());

        // カメラの追従処理
        // 1. カメラの正面方向を取得する（この場合ローカル空間での (0, 0, 1) 方向）
        var cameraDirection = camera.getDirection(new BABYLON.Vector3(0, 0, 1));

        // 2. y成分を0にして水平面方向のみにする
        cameraDirection.y = 0;
        cameraDirection.normalize();

        // 3. Lerpによる線形補間ではなく、キャラクターの位置に直接ターゲットを設定する
        const headPosition = displayCapsule.position.clone().addInPlace(headOffset);
        //camera.setTarget(headPosition);

        // 4. カメラとキャラクター表示カプセルとの距離を計算
        var dist = BABYLON.Vector3.Distance(camera.position, headPosition);

        // 5. カメラ位置の水平方向の補正値を計算する処理
        //    ※ ここではまだ、水平方向の位置調整を行っていますが、
        //        必要に応じて処理を変更または削除することもできます。
        const amount = (Math.min(dist - 1, 0) + Math.max(dist - 1.1, 0)) * 0.04;
        //cameraDirection.scaleAndAddToRef(amount, camera.position);
        camera.position.copyFrom(headPosition);
        // 6. カメラの高さも直接キャラクターの高さに合わせる
        //camera.position.y = headPosition.y;
      });

      // After physics update, compute and set new velocity, update the character controller state
      scene.onAfterPhysicsObservable.add((_) => {
        if (scene.deltaTime == undefined) return;
        let dt = scene.deltaTime / 1000.0;
        if (dt == 0) return;
        //キャラクターの移動
        const down = new BABYLON.Vector3(0, -1, 0);
        const support = characterController.checkSupport(dt, down);
        BABYLON.Quaternion.FromEulerAnglesToRef(0, camera.rotation.y, 0, characterOrientation);
        let desiredLinearVelocity = getDesiredVelocity(dt, support, characterOrientation, characterController.getVelocity());
        characterController.setVelocity(desiredLinearVelocity);
        characterController.integrate(dt, support, characterGravity);
        //カメラの回転
        //camera.rotation.y += rotateDirection * cameraAngularSpeed;
        //console.log('camera.rotation.y=', camera.rotation.y);
      });

      // カメラの回転
      let isMouseDown = false;
      scene.onPointerObservable.add((pointerInfo) => {
        const isRightClick = pointerInfo.event.inputIndex == BABYLON.PointerInput.RightClick;
        switch (pointerInfo.type) {
          case BABYLON.PointerEventTypes.POINTERDOWN:
            isMouseDown = isRightClick;
            break;
          case BABYLON.PointerEventTypes.POINTERUP:
            isMouseDown = false;
            break;
          case BABYLON.PointerEventTypes.POINTERMOVE:
            if (isMouseDown) {
              camera.rotation.y += pointerInfo.event.movementX * cameraAngularSpeed;
              camera.rotation.x += pointerInfo.event.movementY * cameraAngularSpeed;
            }
            break;
        }
      });
      // Input to direction
      // from keys down/up, update the Vector3 inputDirection to match the intended direction. Jump with space
      scene.onKeyboardObservable.add((kbInfo) => {
        switch (kbInfo.type) {
          case BABYLON.KeyboardEventTypes.KEYDOWN:
            if (kbInfo.event.key == 'w' || kbInfo.event.key == 'ArrowUp') {
              inputDirection.z = 1;
            } else if (kbInfo.event.key == 's' || kbInfo.event.key == 'ArrowDown') {
              inputDirection.z = -1;
            } else if (kbInfo.event.key == 'a' || kbInfo.event.key == 'ArrowLeft') {
              inputDirection.x = -1;
            } else if (kbInfo.event.key == 'd' || kbInfo.event.key == 'ArrowRight') {
              inputDirection.x = 1;
            } else if (kbInfo.event.key == ' ') {
              wantJump = true;
            }
            break;
          case BABYLON.KeyboardEventTypes.KEYUP:
            if (kbInfo.event.key == 'w' || kbInfo.event.key == 's' || kbInfo.event.key == 'ArrowUp' || kbInfo.event.key == 'ArrowDown') {
              inputDirection.z = 0;
            }
            if (kbInfo.event.key == 'a' || kbInfo.event.key == 'd' || kbInfo.event.key == 'ArrowLeft' || kbInfo.event.key == 'ArrowRight') {
              //rotateDirection = 0;
              inputDirection.x = 0;
            } else if (kbInfo.event.key == ' ') {
              wantJump = false;
            }
            break;
        }
      });

      //スカイボックス

      const skyMaterial = new SkyMaterial("skyMaterial", scene);
      skyMaterial.backFaceCulling = false;

      const skybox = BABYLON.MeshBuilder.CreateBox("skyBox", { size: 1000.0 }, scene);
      skybox.material = skyMaterial;
      //const envTexture = new BABYLON.CubeTexture("/textures/Daylight_01", scene);
      //const skybox = scene.createDefaultSkybox(envTexture, true, 1000);
      //console.log('skybox intensity=',skybox.intensity);
      // ライトの追加

      const hemisphericLight = new BABYLON.HemisphericLight(
        'hemiLight',
        new BABYLON.Vector3(1, 1, 0),
        scene
      );
      hemisphericLight.intensity = 0.5;
      //console.log('hemisphericLight intensity=',hemisphericLight.intensity);
      // 追加のライト（オプション）
      const directionalLight = new BABYLON.DirectionalLight(
        'directionalLight',
        new BABYLON.Vector3(-1, -2, -1),
        scene
      );
      directionalLight.position = new BABYLON.Vector3(2000, 4000, 2000);
      console.log('directionalLight intensity=', directionalLight.intensity);

      // シャドウマップの設定（オプション）
      const shadowGenerator = new BABYLON.ShadowGenerator(1024, directionalLight);

      // ローディングインジケーターの作成
      const advancedTexture = AdvancedDynamicTexture.CreateFullscreenUI('UI');
      const loadingText = new TextBlock();
      loadingText.text = 'Loading...';
      loadingText.color = 'white';
      loadingText.fontSize = 24;
      loadingText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      loadingText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
      advancedTexture.addControl(loadingText);

      // GLTFモデルのロードを非同期関数内で実行
      const loadModel = async () => {
        try {
          const result = await BABYLON.SceneLoader.ImportMeshAsync(
            '', // 全てのメッシュをインポート
            '/models/', // モデルファイルのディレクトリ
            'ifaa_house_03_invertZ.glb', // 正しいモデルファイル名
            scene
          );

          // モデルの初期位置とスケーリングを調整
          result.meshes.forEach((mesh) => {
            //console.log('load mesh=', mesh.name, ' indices.length=', mesh.getIndices()?.length);
            mesh.position = new BABYLON.Vector3(0, 0, 0);
            //mesh.scaling = new BABYLON.Vector3(1, 1, 1); // 必要に応じてスケーリング
            shadowGenerator.addShadowCaster(mesh);
            const indices = mesh.getIndices();
            const indicesLength = indices ? indices.length : 0;
            if (indicesLength > 0) {
              let ag = new BABYLON.PhysicsAggregate(mesh, BABYLON.PhysicsShapeType.MESH, { mass: 0 });
            }
          });

          // ローディングインジケーターの非表示
          advancedTexture.removeControl(loadingText);
        } catch (error) {
          console.error('GLTFモデルのロード中にエラーが発生しました:', error);
          loadingText.text = 'Failed to load model.';
        }
      };
      loadModel();


      // ウィンドウサイズの変更に対応
      const handleResize = () => {
        engine.resize();
      };
      window.addEventListener('resize', handleResize);

      // レンダーループの開始
      engine.runRenderLoop(() => {
        scene.render();
      });

      // クリーンアップ
      return () => {
        window.removeEventListener('resize', handleResize);
        //window.removeEventListener('keydown', handleKeyDown);
        scene.dispose();
        engine.dispose();
      };
    };
    // initScene を呼び出す
    initScene().catch(error => {
      console.error('シーン初期化中にエラーが発生しました:', error);
    });

  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100vh', display: 'block' }}
    />
  );
};

export default BabylonScene;