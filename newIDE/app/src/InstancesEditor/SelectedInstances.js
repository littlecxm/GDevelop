// @flow
import gesture from 'pixi-simple-gesture';
import transformRect from '../Utils/TransformRect';
import * as PIXI from 'pixi.js-legacy';
import { type ScreenType } from '../UI/Reponsive/ScreenTypeMeasurer';
import InstancesSelection from './InstancesSelection';
import {
  type ResizeGrabbingLocation,
  resizeGrabbingLocationValues,
  resizeGrabbingRelativePositions,
  canMoveOnX,
  canMoveOnY,
} from './InstancesResizer';
import { type InstanceMeasurer } from './InstancesRenderer';
import Rectangle from '../Utils/Rectangle';

type Props = {|
  instancesSelection: InstancesSelection,
  instanceMeasurer: InstanceMeasurer,
  onResize: (
    deltaX: number,
    deltaY: number,
    grabbingLocation: ResizeGrabbingLocation
  ) => void,
  onResizeEnd: () => void,
  onRotate: (number, number) => void,
  onRotateEnd: () => void,
  toCanvasCoordinates: (x: number, y: number) => [number, number],
  screenType: ScreenType,
|};

const getButtonSizes = (screenType: ScreenType) => {
  if (screenType === 'touch') {
    return {
      bigButtonSize: 14,
      smallButtonSize: 12,
      buttonPadding: 5,
      hitAreaPadding: 12,
    };
  }

  return {
    bigButtonSize: 10,
    smallButtonSize: 8,
    buttonPadding: 5,
    hitAreaPadding: 5,
  };
};

const RECTANGLE_BUTTON_SHAPE = 0;
const CIRCLE_BUTTON_SHAPE = 1;

const resizeGrabbingIconNames = {
  TopLeft: 'nwse-resize',
  BottomLeft: 'nesw-resize',
  BottomRight: 'nwse-resize',
  TopRight: 'nesw-resize',
  Top: 'ns-resize',
  Left: 'ew-resize',
  Bottom: 'ns-resize',
  Right: 'ew-resize',
};

/**
 * Render selection rectangle for selected instances.
 */
export default class SelectedInstances {
  instancesSelection: InstancesSelection;
  instanceMeasurer: InstanceMeasurer;
  onResize: (
    deltaX: number,
    deltaY: number,
    grabbingLocation: ResizeGrabbingLocation
  ) => void;
  onResizeEnd: () => void;
  onRotate: (number, number) => void;
  onRotateEnd: () => void;
  toCanvasCoordinates: (x: number, y: number) => [number, number];
  _screenType: ScreenType;

  pixiContainer = new PIXI.Container();
  rectanglesContainer = new PIXI.Container();
  selectedRectangles = [];
  resizeButtons: { [ResizeGrabbingLocation]: PIXI.Graphics } = {};
  rotateButton = new PIXI.Graphics();

  constructor({
    instancesSelection,
    instanceMeasurer,
    onResize,
    onResizeEnd,
    onRotate,
    onRotateEnd,
    toCanvasCoordinates,
    screenType,
  }: Props) {
    this.instanceMeasurer = instanceMeasurer;
    this.onResize = onResize;
    this.onResizeEnd = onResizeEnd;
    this.onRotate = onRotate;
    this.onRotateEnd = onRotateEnd;
    this.toCanvasCoordinates = toCanvasCoordinates;
    this.instancesSelection = instancesSelection;
    this._screenType = screenType;

    this.pixiContainer.addChild(this.rectanglesContainer);

    for (const resizeGrabbingLocation of resizeGrabbingLocationValues) {
      const resizeButton = new PIXI.Graphics();
      this.resizeButtons[resizeGrabbingLocation] = resizeButton;
      this._makeButton(
        resizeButton,
        event => {
          this.onResize(event.deltaX, event.deltaY, resizeGrabbingLocation);
        },
        () => {
          this.onResizeEnd();
        },
        resizeGrabbingIconNames[resizeGrabbingLocation]
      );
    }
    this._makeButton(
      this.rotateButton,
      event => {
        this.onRotate(event.deltaX, event.deltaY);
      },
      () => {
        this.onRotateEnd();
      },
      'url("res/actions/rotate24_black.png"),auto'
    );
  }

  setScreenType(screenType: ScreenType) {
    this._screenType = screenType;
  }

  _makeButton(
    objectButton: PIXI.Graphics,
    onMove: (event: any) => void,
    onEnd: () => void,
    cursor: string
  ) {
    objectButton.interactive = true;
    objectButton.buttonMode = true;
    objectButton.cursor = cursor;
    gesture.panable(objectButton);
    objectButton.on('panmove', onMove);
    objectButton.on('panend', onEnd);
    this.pixiContainer.addChild(objectButton);
  }

  getPixiContainer() {
    return this.pixiContainer;
  }

  _renderButton(
    show: boolean,
    buttonObject: PIXI.Graphics,
    canvasPosition: [number, number],
    size: number,
    shape: 0 | 1,
    hitAreaPadding: number
  ) {
    buttonObject.clear();
    if (!show) {
      buttonObject.hitArea = new PIXI.Rectangle(0, 0, 0, 0);
      return;
    }

    buttonObject.beginFill(0xffffff);
    buttonObject.lineStyle(1, 0x6868e8, 1);
    buttonObject.fill.alpha = 0.9;
    if (shape === RECTANGLE_BUTTON_SHAPE) {
      buttonObject.drawRect(canvasPosition[0], canvasPosition[1], size, size);
    } else if (shape === CIRCLE_BUTTON_SHAPE) {
      buttonObject.drawCircle(
        canvasPosition[0] + size / 2,
        canvasPosition[1] + size / 2,
        size / 2
      );
    }

    buttonObject.endFill();
    buttonObject.hitArea = new PIXI.Rectangle(
      canvasPosition[0] - hitAreaPadding,
      canvasPosition[1] - hitAreaPadding,
      size + hitAreaPadding * 2,
      size + hitAreaPadding * 2
    );
  }

  render() {
    const {
      bigButtonSize,
      smallButtonSize,
      buttonPadding,
      hitAreaPadding,
    } = getButtonSizes(this._screenType);
    const selection = this.instancesSelection.getSelectedInstances();
    let x1 = 0;
    let y1 = 0;
    let x2 = 0;
    let y2 = 0;
    let initialised = false;

    // Update the selection rectangle of each instance.
    for (var i = 0; i < selection.length; i++) {
      if (this.selectedRectangles.length === i) {
        const newRectangle = new PIXI.Graphics();
        newRectangle.hitArea = new PIXI.Rectangle(0, 0, 0, 0);
        this.selectedRectangles.push(newRectangle);
        this.rectanglesContainer.addChild(newRectangle);
      }

      const instance = selection[i];
      const instanceRect = this.instanceMeasurer.getInstanceAABB(
        instance,
        new Rectangle()
      );
      const selectionRectangle = transformRect(
        this.toCanvasCoordinates,
        instanceRect
      );

      this.selectedRectangles[i].clear();
      const selectionRectangleColor = instance.isLocked() ? 0xbc5753 : 0x6868e8;
      this.selectedRectangles[i].beginFill(selectionRectangleColor);
      this.selectedRectangles[i].lineStyle(1, selectionRectangleColor, 1);
      this.selectedRectangles[i].fill.alpha = 0.3;
      this.selectedRectangles[i].alpha = 0.8;
      this.selectedRectangles[i].drawRect(
        selectionRectangle.left,
        selectionRectangle.top,
        selectionRectangle.width(),
        selectionRectangle.height()
      );
      this.selectedRectangles[i].endFill();

      if (instance.isLocked()) {
        continue;
      }
      if (!initialised) {
        x1 = instanceRect.left;
        y1 = instanceRect.top;
        x2 = instanceRect.left + instanceRect.width();
        y2 = instanceRect.top + instanceRect.height();
        initialised = true;
      } else {
        if (instanceRect.left < x1) x1 = instanceRect.left;
        if (instanceRect.top < y1) y1 = instanceRect.top;
        if (instanceRect.left + instanceRect.width() > x2)
          x2 = instanceRect.left + instanceRect.width();
        if (instanceRect.top + instanceRect.height() > y2)
          y2 = instanceRect.top + instanceRect.height();
      }
    }

    while (this.selectedRectangles.length > selection.length) {
      this.rectanglesContainer.removeChild(this.selectedRectangles.pop());
    }

    // If there are no unlocked instances, hide the resize buttons.
    const show =
      selection.filter(instance => !instance.isLocked()).length !== 0;

    // Position the resize buttons.
    for (const grabbingLocation of resizeGrabbingLocationValues) {
      const resizeButton = this.resizeButtons[grabbingLocation];
      const relativePositions =
        resizeGrabbingRelativePositions[grabbingLocation];

      const useBigButton =
        canMoveOnX(grabbingLocation) && canMoveOnY(grabbingLocation);
      const buttonSize = useBigButton ? bigButtonSize : smallButtonSize;
      const padding = buttonPadding + buttonSize / 2;
      const resizeButtonPos = this.toCanvasCoordinates(
        x1 + relativePositions[0] * (x2 - x1),
        y1 + relativePositions[1] * (y2 - y1)
      );
      resizeButtonPos[0] +=
        -buttonSize / 2 + padding * Math.sign(relativePositions[0] - 0.5);
      resizeButtonPos[1] +=
        -buttonSize / 2 + padding * Math.sign(relativePositions[1] - 0.5);

      this._renderButton(
        show,
        resizeButton,
        resizeButtonPos,
        buttonSize,
        RECTANGLE_BUTTON_SHAPE,
        hitAreaPadding
      );
    }

    const rotateButtonPos = this.toCanvasCoordinates(x1 + (x2 - x1) / 2, y1);
    rotateButtonPos[0] -= smallButtonSize / 2;
    rotateButtonPos[1] -= buttonPadding * 8;

    this._renderButton(
      show,
      this.rotateButton,
      rotateButtonPos,
      smallButtonSize,
      CIRCLE_BUTTON_SHAPE,
      hitAreaPadding
    );
  }
}
