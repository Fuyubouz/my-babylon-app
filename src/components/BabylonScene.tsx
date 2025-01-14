// components/BabylonScene.tsx
'use client';

import React, { useEffect, useRef } from 'react';
import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders';
import '@babylonjs/gui';
import { AdvancedDynamicTexture, TextBlock, Control } from '@babylonjs/gui';
import { FreeCameraKeyboardWalkInput } from './FreeCameraKeybordWalkInput';
import HavokPhysics from "@babylonjs/havok";

async function getInitializedHavok() {
  return await HavokPhysics();
}

const BabylonScene: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const velocityY = useRef(0); // 垂直方向の速度 (cm/s)
  const isOnGround = useRef(true); // 地面にいるかどうか

  useEffect(() => {
    if (!canvasRef.current) return;

    // Babylon.js エンジンとシーンの初期化
    const engine = new BABYLON.Engine(canvasRef.current, true);
    const scene = new BABYLON.Scene(engine);
    // async 関数内で HavokPhysics の await を使う
    const initScene = async () => {
      console.log('0');
      // Initialize Havok plugin
      const havokInstance = await HavokPhysics();//#1 error:'await' expressions are only allowed within async functions and at the top levels of modules.ts(1308)
      const havok = new BABYLON.HavokPlugin(false, havokInstance);
      console.log('1');
      // Enable physics in the scene with a gravity
      scene.enablePhysics(new BABYLON.Vector3(0, -9.8, 0), havok);


      // ファーストパーソンカメラの設定
      const camera = new BABYLON.UniversalCamera(
        'FirstPersonCamera',
        new BABYLON.Vector3(0, 10, -1), // 初期位置
        scene
      );
      /*
      camera.attachControl(canvasRef.current, true);
      camera.angularSensibility = 1000; // マウス感度の調整
      */

      //キャラクターの設定
      var state: string | null | undefined = "IN_AIR";
      var inAirSpeed = 8.0;
      var onGroundSpeed = 10.0;
      var jumpHeight = 1.5;
      var wantJump = false;
      var inputDirection = new BABYLON.Vector3(0, 0, 0);
      var forwardLocalSpace = new BABYLON.Vector3(0, 0, 1);
      let characterOrientation = BABYLON.Quaternion.Identity();
      let characterGravity = new BABYLON.Vector3(0, -1, 0);

      // Physics shape for the character
      let h = 1.8;
      let r = 0.6;
      let displayCapsule = BABYLON.MeshBuilder.CreateCapsule("CharacterDisplay", { height: h, radius: r }, scene);
      let characterPosition = new BABYLON.Vector3(0, 10, 0);
      let characterController = new BABYLON.PhysicsCharacterController(characterPosition, { capsuleHeight: h, capsuleRadius: r }, scene);
      camera.setTarget(characterPosition);

      // State handling
      // depending on character state and support, set the new state
      var getNextState = function (supportInfo: BABYLON.CharacterSurfaceInfo) {
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
      var getDesiredVelocity = function (
        deltaTime: number,
        supportInfo: BABYLON.CharacterSurfaceInfo,
        characterOrientation: BABYLON.Quaternion,
        currentVelocity: BABYLON.Vector3
      ) {
        let nextState = getNextState(supportInfo);
        if (nextState != state) {
          state = nextState;
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
        displayCapsule.position.copyFrom(characterController.getPosition());

        // camera following
        var cameraDirection = camera.getDirection(new BABYLON.Vector3(0, 0, 1));
        cameraDirection.y = 0;
        cameraDirection.normalize();
        camera.setTarget(BABYLON.Vector3.Lerp(camera.getTarget(), displayCapsule.position, 0.1));
        var dist = BABYLON.Vector3.Distance(camera.position, displayCapsule.position);
        const amount = (Math.min(dist - 6, 0) + Math.max(dist - 9, 0)) * 0.04;
        cameraDirection.scaleAndAddToRef(amount, camera.position);
        camera.position.y += (displayCapsule.position.y + 2 - camera.position.y) * 0.04;
      });

      // After physics update, compute and set new velocity, update the character controller state
      scene.onAfterPhysicsObservable.add((_) => {
        if (scene.deltaTime == undefined) return;
        let dt = scene.deltaTime / 1000.0;
        if (dt == 0) return;

        let down = new BABYLON.Vector3(0, -1, 0);
        let support = characterController.checkSupport(dt, down);

        BABYLON.Quaternion.FromEulerAnglesToRef(0, camera.rotation.y, 0, characterOrientation);
        let desiredLinearVelocity = getDesiredVelocity(dt, support, characterOrientation, characterController.getVelocity());
        characterController.setVelocity(desiredLinearVelocity);

        characterController.integrate(dt, support, characterGravity);
      });

      // Rotate camera
      // Add a slide vector to rotate arount the character
      let isMouseDown = false;
      scene.onPointerObservable.add((pointerInfo) => {
        switch (pointerInfo.type) {
          case BABYLON.PointerEventTypes.POINTERDOWN:
            isMouseDown = true;
            break;

          case BABYLON.PointerEventTypes.POINTERUP:
            isMouseDown = false;
            break;

          case BABYLON.PointerEventTypes.POINTERMOVE:
            if (isMouseDown) {
              var tgt = camera.getTarget().clone();
              camera.position.addInPlace(camera.getDirection(BABYLON.Vector3.Right()).scale(pointerInfo.event.movementX * -0.02));
              camera.setTarget(tgt);
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
              inputDirection.x = 0;
            } else if (kbInfo.event.key == ' ') {
              wantJump = false;
            }
            break;
        }
      });

      // ライトの追加
      const hemisphericLight = new BABYLON.HemisphericLight(
        'hemiLight',
        new BABYLON.Vector3(1, 1, 0),
        scene
      );

      // 追加のライト（オプション）
      const directionalLight = new BABYLON.DirectionalLight(
        'directionalLight',
        new BABYLON.Vector3(-1, -2, -1),
        scene
      );
      directionalLight.position = new BABYLON.Vector3(2000, 4000, 2000); // cm単位に調整

      // シャドウマップの設定（オプション）
      const shadowGenerator = new BABYLON.ShadowGenerator(1024, directionalLight);

      // 地面の追加
      const ground1 = BABYLON.MeshBuilder.CreateGround(
        'ground',
        { width: 50, height: 50 }, // 地面のサイズをcm単位に設定
        scene
      );
      ground1.position.set(0, 8, 0);
      ground1.checkCollisions = true; // 地面の衝突判定を有効化
      ground1.receiveShadows = true;
      const groundMaterial1 = new BABYLON.StandardMaterial('groundMaterial', scene);
      groundMaterial1.diffuseColor = new BABYLON.Color3(1, 0.5, 0.5);
      ground1.material = groundMaterial1;
      let plane1 = new BABYLON.PhysicsAggregate(ground1, BABYLON.PhysicsShapeType.BOX, { mass: 0 });

      const ground2 = BABYLON.MeshBuilder.CreateGround(
        'ground',
        { width: 50, height: 50 }, // 地面のサイズをcm単位に設定
        scene
      );
      ground2.position.set(50, 0, 0);
      ground2.checkCollisions = true; // 地面の衝突判定を有効化
      ground2.receiveShadows = true;
      const groundMaterial2 = new BABYLON.StandardMaterial('groundMaterial', scene);
      groundMaterial1.diffuseColor = new BABYLON.Color3(0, 1, 0.5);
      ground2.material = groundMaterial2;
      let plane2 = new BABYLON.PhysicsAggregate(ground2, BABYLON.PhysicsShapeType.BOX, { mass: 0 });

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
      /*
      const loadModel = async () => {
        try {
          const result = await BABYLON.SceneLoader.ImportMeshAsync(
            '', // 全てのメッシュをインポート
            '/models/', // モデルファイルのディレクトリ
            'ifaa_house_01.glb', // 正しいモデルファイル名
            scene
          );
  
          // モデルの初期位置とスケーリングを調整
          result.meshes.forEach((mesh) => {
            mesh.position = new BABYLON.Vector3(0, 0, 0);
            mesh.scaling = new BABYLON.Vector3(1, 1, 1); // 必要に応じてスケーリング
            shadowGenerator.addShadowCaster(mesh);
            if (mesh !== ground) { // 地面以外のメッシュに衝突判定を追加
              //mesh.checkCollisions = true;
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
      */

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