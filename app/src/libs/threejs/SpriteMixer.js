import { SpriteMaterial, Sprite, RepeatWrapping } from "three";

// Author: Felix Mariotto

// Based on Lee Stemkoski's work who coded the core texture offsetting part :
// http://stemkoski.github.io/Three.js/Texture-Animation.html

export function SpriteMixer() {
  var actionSprites = []; // Will store every new actionSprite.
  var listeners = []; // Will store the user callbacks to call upon loop, finished, etc..

  var api = {
    actionSprites: actionSprites,
    update: update,
    ActionSprite: ActionSprite,
    Action: Action,
    addEventListener: addEventListener,
  };

  // It can be used to make SpriteMixer call a callback function
  // when an action is finished or looping. eventName argument can
  // be either "finished" or "loop".
  function addEventListener(eventName, callback) {
    if (eventName && callback) {
      listeners.push({ eventName, callback });
    } else {
      throw "Error : an argument is missing";
    }
  }

  // Update every stored actionSprite if needed.
  function update(delta) {
    actionSprites.forEach((actionSprite) => {
      if (actionSprite.paused == false) {
        updateAction(actionSprite.currentAction, delta * 1000);
      }
    });
  }

  // This offsets the texture to make the next frame of the animation appear.
  function offsetTexture(actionSprite) {
    actionSprite.material.map.offset.x =
      actionSprite.getColumn() / actionSprite.tilesHoriz;
    actionSprite.material.map.offset.y =
      (actionSprite.tilesVert - actionSprite.getRow() - 1) / actionSprite.tilesVert;
  }

  // This is called during the loop, it first check if the animation must
  // be updated, then increment actionSprite.currentTile, then call offsetTexture().
  // Various operations are made depending on clampWhenFinished and hideWhenFinished
  // options.
  function updateAction(action, milliSec) {
    action.actionSprite.currentDisplayTime += milliSec;

    while (action.actionSprite.currentDisplayTime > action.tileDisplayDuration) {
      action.actionSprite.currentDisplayTime -= action.tileDisplayDuration;
      action.actionSprite.currentTile = action.actionSprite.currentTile + 1;

      // Restarts the animation if the last frame was reached at last call.
      if (action.actionSprite.currentTile > action.indexEnd) {
        action.actionSprite.currentTile = action.indexStart;

        // Call the user callbacks on the event 'loop'
        if (action.mustLoop == true) {
          listeners.forEach((listener) => {
            if (listener.eventName == "loop") {
              listener.callback({
                type: "loop",
                action: action,
              });
            }
          });
        } else {
          // action must not loop

          if (action.clampWhenFinished == true) {
            action.actionSprite.paused = true;

            if (action.hideWhenFinished == true) {
              action.actionSprite.visible = false;
            }

            callFinishedListeners(action);
          } else {
            // must restart the animation before to stop

            action.actionSprite.paused = true;

            if (action.hideWhenFinished == true) {
              action.actionSprite.visible = false;
            }

            // Call updateAction() a last time after a frame duration,
            // even if the action is actually paused before, in order to restart
            // the animation.
            setTimeout(() => {
              updateAction(action, action.tileDisplayDuration);
              callFinishedListeners(action);
            }, action.tileDisplayDuration);
          }
        }
      }

      offsetTexture(action.actionSprite);

      // Call the user callbacks on the event 'finished'.
      function callFinishedListeners(action) {
        listeners.forEach((listener) => {
          if (listener.eventName == "finished") {
            listener.callback({
              type: "finished",
              action: action,
            });
          }
        }, action.tileDisplayDuration);
      }
    }
  }

  // reveal the sprite and play the action only once
  function playOnce() {
    this.mustLoop = false;
    this.actionSprite.currentAction = this;
    this.actionSprite.currentTile = this.indexStart;
    offsetTexture(this.actionSprite);
    this.actionSprite.paused = false;
    this.actionSprite.visible = true;
  }

  // resume the action if it was paused
  function resume() {
    // this is in case setFrame was used to set a frame outside of the
    // animation range, which would lead to bugs.
    if (this.currentTile > this.indexStart && this.currentTile < this.indexEnd) {
      this.currentTile = this.indexStart;
    }
    this.actionSprite.paused = false;
    this.actionSprite.visible = true;
  }

  // reveal the sprite and play it in a loop
  function playLoop() {
    this.mustLoop = true;
    this.actionSprite.currentAction = this;
    this.actionSprite.currentTile = this.indexStart;
    offsetTexture(this.actionSprite);
    this.actionSprite.paused = false;
    this.actionSprite.visible = true;
  }

  // pause the action when it reach the last frame
  function pauseNextEnd() {
    this.mustLoop = false;
  }

  // pause the action on the current frame
  function pause() {
    this.actionSprite.paused = true;
  }

  // pause and reset the action
  function stop() {
    this.actionSprite.currentDisplayTime = 0;
    this.actionSprite.currentTile = this.indexStart;
    this.actionSprite.paused = true;
    if (this.hideWhenFinished == true) {
      this.actionSprite.visible = false;
    }
    offsetTexture(this.actionSprite);
  }

  // Set manually a frame of the animation. Frame indexing starts at 0.
  function setFrame(frameID) {
    this.paused = true;
    this.currentTile = frameID;
    offsetTexture(this);
  }

  // returns the row of the current tile.
  function getRow() {
    return Math.floor(this.currentTile / this.tilesHoriz);
  }

  // returns the column of the current tile.
  function getColumn() {
    return this.currentTile % this.tilesHoriz;
  }

  /*
		SpriteMixer.ActionSprite() returns an extended THREE.Sprite.
		All the parameters necessary for the animation are stored inside,
		but you can still use it as any THREE.Sprite, like scale it etc..

		ActionSprite(texture:THREE.Texture, tilesHoriz:integer, tilesVert:integer)
			- texture : texture containing all the frames in a grid.
			- tilesHoriz : number of frames on the horizontal direction.
			- tilesVert : number of frames on the vertical direction.
	*/
  function ActionSprite(texture, tilesHoriz, tilesVert) {
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.repeat.set(1 / tilesHoriz, 1 / tilesVert);

    let spriteMaterial = new SpriteMaterial({
      map: texture,
      color: 0xffffff,
      depthTest: false,
    });

    let actionSprite = new Sprite(spriteMaterial);
    actionSprite.isIndexedSprite = true;

    actionSprite.tilesHoriz = tilesHoriz;
    actionSprite.tilesVert = tilesVert;
    actionSprite.tiles = tilesHoriz * tilesVert;
    actionSprite.currentDisplayTime = 0;
    actionSprite.currentTile = 0;
    actionSprite.paused = true;

    actionSprite.setFrame = setFrame;
    actionSprite.getRow = getRow;
    actionSprite.getColumn = getColumn;

    offsetTexture(actionSprite);

    actionSprites.push(actionSprite);

    return actionSprite;
  }

  /*
		SpriteMixer.Action returns an object containing the informations related to a
		specific sequence in an actionSprite. For instance, if the actionSprite
		contains 20 tiles, an Action could start at tile 5 and finish at tile 8.

		Action( actionSprite:ActionSprite, indexStart:integer, indexEnd:integer, tileDisplayDuration:integer )
			- actionSprite is a SpriteMixer.ActionSprite, containing a loaded texture with tiles
			- indexStart is the starting tile of the animation, index starts at 0.
			- indexEnd is the ending tile of the animation
			- tileDisplayDuration is the duration of ONE FRAME in the animation
	*/

  function Action(actionSprite, indexStart, indexEnd, tileDisplayDuration) {
    if (!actionSprite.isIndexedSprite) {
      throw 'Error : "texture" argument must be an indexedTexture.';
      return;
    }

    return {
      type: "spriteAction",
      playOnce,
      playLoop,
      resume,
      pause,
      pauseNextEnd,
      stop,
      clampWhenFinished: true,
      hideWhenFinished: false,
      mustLoop: true,
      indexStart,
      indexEnd,
      tileDisplayDuration,
      actionSprite,
    };
  }

  return api;
}
