import * as BABYLON from '@babylonjs/core';

export class FreeCameraKeyboardWalkInput {
  // キーコードの配列（現在押下中のキー）
  private _keys: string[] = [];

  // 使用するキーコード
  public keysUp: string[] = ['ArrowUp', 'W'];
  public keysDown: string[] = ['ArrowDown', 'S'];
  public keysLeft: string[] = ['ArrowLeft', 'KeyA'];
  public keysRight: string[] = ['ArrowRight', 'KeyD'];
  public keysJump: string[] = ['Space'];

  // イベントハンドラの参照（null 許容）
  private _onKeyDown: ((evt: KeyboardEvent) => void) | null = null;
  private _onKeyUp: ((evt: KeyboardEvent) => void) | null = null;

  public camera: BABYLON.FreeCamera;
  //public canvas: HTMLCanvasElement;

  private cameraAngle: number = Math.PI / 2;
  private cameraDirection: BABYLON.Vector3 = new BABYLON.Vector3(Math.cos(this.cameraAngle), 0, Math.sin(this.cameraAngle));;
  private angularSpeed: number = 0.01;

  constructor(
    camera: BABYLON.FreeCamera,
  ) {
    this.camera = camera;
    this.camera.speed = 0.5;
  }

  /**
   * キー入力イベントをアタッチします。
   * @param noPreventDefault true の場合、preventDefault を呼び出さない
   */
  public attachControl(noPreventDefault?: boolean): void {
    const engine = this.camera.getEngine();
    const element = engine.getInputElement();

    // イベントハンドラが未設定の場合のみ設定する
    if (element && !this._onKeyDown) {
      // キー入力を受け取るために tabIndex を設定
      element.tabIndex = 1;

      this._onKeyDown = (evt: KeyboardEvent) => {
        //console.log('code=', evt.code);
        // 対象キーの場合のみ処理
        if (
          this.keysUp.includes(evt.code)||
          this.keysDown.includes(evt.code) ||
          this.keysLeft.includes(evt.code)  ||
          this.keysRight.includes(evt.code) ||
          this.keysJump.includes(evt.code)
        ) {
          const index = this._keys.indexOf(evt.code);
          if (index === -1) {
            this._keys.push(evt.code);
          }
          if (!noPreventDefault) {
            evt.preventDefault();
          }
        }
      };

      this._onKeyUp = (evt: KeyboardEvent) => {
        if (
          this.keysUp.includes(evt.code)||
          this.keysDown.includes(evt.code) ||
          this.keysLeft.includes(evt.code)  ||
          this.keysRight.includes(evt.code) ||
          this.keysJump.includes(evt.code)
        ) {
          const index = this._keys.indexOf(evt.code);
          if (index >= 0) {
            this._keys.splice(index, 1);
          }
          if (!noPreventDefault) {
            evt.preventDefault();
          }
        }
      };

      element.addEventListener("keydown", this._onKeyDown, false);
      element.addEventListener("keyup", this._onKeyUp, false);
    }
  }

  /**
   * キー入力イベントを解除します。
   */
  public detachControl(): void {
    const engine = this.camera.getEngine();
    const element = engine.getInputElement();

    if (element && this._onKeyDown) {
      element.removeEventListener("keydown", this._onKeyDown);
      if (this._onKeyUp) element.removeEventListener("keyup", this._onKeyUp);

      // canvas 等のグローバルイベントからも解除する場合は、BABYLON.Tools.UnregisterTopRootEvents を利用
      // ※ canvas の参照が必要な場合は、適宜引数に渡すか、プロパティとして保持してください。
      BABYLON.Tools.UnregisterTopRootEvents(window, [
        { name: "blur", handler: this._onLostFocus.bind(this) }
      ]);

      // 押下中のキー情報をリセット
      this._keys = [];
      this._onKeyDown = null;
      this._onKeyUp = null;
    }
  }

  /**
   * カメラに対して、キーの状態に応じた移動や回転処理を行います。
   */
  public checkInputs(): void {
    if (this._onKeyDown) {
      const camera = this.camera;
      for (let index = 0; index < this._keys.length; index++) {
        const keyCode = this._keys[index];
        const speed = camera.speed;

        if (this.keysLeft.indexOf(keyCode) !== -1) {
          // 左に回転
          camera.rotation.y -= this.angularSpeed;
          this.cameraDirection.copyFromFloats(0, 0, 0);
        } else if (this.keysUp.indexOf(keyCode) !== -1) {
          // 前進
          this.cameraDirection.copyFromFloats(0, 0, speed);
        } else if (this.keysRight.indexOf(keyCode) !== -1) {
          // 右に回転
          camera.rotation.y += this.angularSpeed;
          this.cameraDirection.copyFromFloats(0, 0, 0);
        } else if (this.keysDown.indexOf(keyCode) !== -1) {
          // 後退
          this.cameraDirection.copyFromFloats(0, 0, -speed);
        }

        // 右手系の場合の調整
        if (camera.getScene().useRightHandedSystem) {
          this.cameraDirection.z *= -1;
        }

        // 現在のビュー行列から逆行列を取得して変換
        camera.getViewMatrix().invertToRef(camera._cameraTransformMatrix);
        BABYLON.Vector3.TransformNormalToRef(
          this.cameraDirection,
          camera._cameraTransformMatrix,
          camera._transformedDirection
        );
        camera.cameraDirection.addInPlace(camera._transformedDirection);
      }
    }
  }

  /**
   * フォーカス喪失時のイベントハンドラ
   */
  private _onLostFocus(e: FocusEvent): void {
    this._keys = [];
  }

  /**
   * クラス名を返します。
   */
  public getClassName(): string {
    return "FreeCameraKeyboardWalkInput";
  }

  /**
   * コントロールの簡易名を返します。
   */
  public getSimpleName(): string {
    return "keyboard";
  }
}
