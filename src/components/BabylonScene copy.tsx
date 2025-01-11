// components/BabylonScene.tsx
'use client';

import React, { useEffect, useRef } from 'react';
import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders';
import '@babylonjs/gui';
import { AdvancedDynamicTexture, TextBlock, Control } from '@babylonjs/gui';

const BabylonScene: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const velocityY = useRef(0); // 垂直方向の速度 (cm/s)
  const isOnGround = useRef(true); // 地面にいるかどうか

  useEffect(() => {
    if (!canvasRef.current) return;

    // Babylon.js エンジンとシーンの初期化
    const engine = new BABYLON.Engine(canvasRef.current, true);
    const scene = new BABYLON.Scene(engine);

    // 重力と衝突の設定
    const assumedFramesPerSecond = 60;
    const earthGravity = -981;//cm
    scene.gravity = new BABYLON.Vector3(0, earthGravity, 0);
    scene.collisionsEnabled = true;

    // ファーストパーソンカメラの設定
    const camera = new BABYLON.UniversalCamera(
      'FirstPersonCamera',
      new BABYLON.Vector3(0, 230, -500), // 初期位置を y=230 cm に設定 (地面 y=0 + ellipsoid.y=50 cm)
      scene
    );
    camera.attachControl(canvasRef.current, true);
    camera.speed = 20; // 移動速度を 50 cm/s に設定
    camera.angularSensibility = 1000; // マウス感度の調整

    // カメラの衝突設定
    camera.applyGravity = true;
    camera.checkCollisions = true;
    camera.ellipsoid = new BABYLON.Vector3(25, 50, 25); // カメラの衝突範囲 (25 cm x 50 cm x 25 cm)

    // キーボード入力のカスタマイズ（矢印キーとWASDキーを追加）
    const KEY_W = 87;
    const KEY_A = 65;
    const KEY_S = 83;
    const KEY_D = 68;

    camera.keysUp.push(38, KEY_W);    // 上矢印キー (Up Arrow), W
    camera.keysDown.push(40, KEY_S);  // 下矢印キー (Down Arrow), S
    camera.keysLeft.push(37, KEY_A);  // 左矢印キー (Left Arrow), A
    camera.keysRight.push(39, KEY_D); // 右矢印キー (Right Arrow), D

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
    const ground = BABYLON.MeshBuilder.CreateGround(
      'ground',
      { width: 10000, height: 10000 }, // 地面のサイズをcm単位に設定
      scene
    );
    ground.checkCollisions = true; // 地面の衝突判定を有効化
    ground.receiveShadows = true;

    // 地面にマテリアルを適用
    const groundMaterial = new BABYLON.StandardMaterial('groundMaterial', scene);
    groundMaterial.diffuseColor = new BABYLON.Color3(0.5, 0.5, 0.5);
    ground.material = groundMaterial;

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

    // ウィンドウサイズの変更に対応
    const handleResize = () => {
      engine.resize();
    };
    window.addEventListener('resize', handleResize);

    // スペースキーによるジャンプ処理
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.code === 'Space' || event.key === ' ') && isOnGround.current) {
        velocityY.current = 500; // ジャンプの初速 cm/s
        isOnGround.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // ジャンプと重力の適用
    scene.registerBeforeRender(() => {
      const deltaTime = engine.getDeltaTime() / 1000; // ミリ秒を秒に変換

      // 重力を速度に加算
      velocityY.current += scene.gravity.y * deltaTime; // cm/s² * s = cm/s

      // カメラの位置を更新
      camera.position.y += velocityY.current * deltaTime; // cm/s * s = cm

      // 地面との衝突判定
      if (camera.position.y <= 180) { // カメラの高さが y=180 cm で地面が y=0
        camera.position.y = 180;
        velocityY.current = 0;
        if (!isOnGround.current) console.log('Grounded');
        isOnGround.current = true;
      } else {
        console.log('Camera Y Position:',camera.position.y);
      }
    });

    // レンダーループの開始
    engine.runRenderLoop(() => {
      scene.render();
    });

    // クリーンアップ
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      scene.dispose();
      engine.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100vh', display: 'block' }}
    />
  );
};

export default BabylonScene;