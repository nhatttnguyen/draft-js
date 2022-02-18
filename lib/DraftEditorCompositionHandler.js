/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * 
 * @emails oncall+draft_js
 */
'use strict';

var DOMObserver = require("./DOMObserver");

var DraftModifier = require("./DraftModifier");

var DraftOffsetKey = require("./DraftOffsetKey");

var EditorState = require("./EditorState");

var Keys = require("fbjs/lib/Keys");

var editOnSelect = require("./editOnSelect");

var getContentEditableContainer = require("./getContentEditableContainer");

var getDraftEditorSelection = require("./getDraftEditorSelection");

var getEntityKeyForSelection = require("./getEntityKeyForSelection");

var nullthrows = require("fbjs/lib/nullthrows");

var editOnBeforeInput = require("./editOnBeforeInput");

var editOnKeyDown = require("./editOnKeyDown");

var keyCommandPlainBackspace = require("./keyCommandPlainBackspace");

var isEventHandled = require("./isEventHandled");

var editOnBeforeInput2 = require("./editOnBeforeInput2");
/**
 * Millisecond delay to allow `compositionstart` to fire again upon
 * `compositionend`.
 *
 * This is used for Korean input to ensure that typing can continue without
 * the editor trying to render too quickly. More specifically, Safari 7.1+
 * triggers `compositionstart` a little slower than Chrome/FF, which
 * leads to composed characters being resolved and re-render occurring
 * sooner than we want.
 */


var RESOLVE_DELAY = 20;
/**
 * A handful of variables used to track the current composition and its
 * resolution status. These exist at the module level because it is not
 * possible to have compositions occurring in multiple editors simultaneously,
 * and it simplifies state management with respect to the DraftEditor component.
 */

var resolved = false;
var stillComposing = false;
var domObserver = null;
var isCompositionEnd = true;
var isOnBeforeInput = false;

function startDOMObserver(editor) {
  if (!domObserver) {
    domObserver = new DOMObserver(getContentEditableContainer(editor));
    domObserver.start();
  }
}

function checkDevice() {
  var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  return isMobile;
}

function getDifference(a, b) {
  var i = 0;
  var j = 0;
  var result = '';

  while (j < b.length) {
    if (a[i] != b[j] || i == a.length) result += b[j];else i++;
    j++;
  }

  return result;
}

var DraftEditorCompositionHandler = {
  /**
   * A `compositionstart` event has fired while we're still in composition
   * mode. Continue the current composition session to prevent a re-render.
   */
  onCompositionStart: function onCompositionStart(editor, e) {
    console.log('onCompositionStart======');
    isCompositionEnd = false;
    stillComposing = true;
    var isMobile = checkDevice();
    var editorState = editor._latestEditorState;
    var selection = editorState.getSelection(); // if (isMobile && selection.getIsBackward()) {
    //   const updateSelection = selection.merge({
    //     anchorKey: selection.getFocusKey(),
    //     anchorOffset: selection.getFocusOffset(),
    //     focusKey: selection.getAnchorKey(),
    //     focusOffset: selection.getAnchorOffset(),
    //     isBackward: false,
    //   });
    //   const newEditorState = EditorState.forceSelection(
    //     editorState,
    //     updateSelection,
    //   );
    //   editor.update(newEditorState);
    // }
    // if (
    //   (isMobile && selection.getFocusKey() !== selection.getAnchorKey()) ||
    //   !isMobile
    // ) {
    //   editor.update(EditorState.set(editorState, {inCompositionMode: true}));
    //   const contentState = editorState.getCurrentContent();
    //   if (!selection.isCollapsed()) {
    //     editor.props.handleBeforeReplaceText(editorState);
    //     const updatedContentState = DraftModifier.removeRange(
    //       contentState,
    //       selection,
    //       'forward',
    //     );
    //     EditorState.push(editorState, updatedContentState, 'remove-range');
    //   }
    // }

    editor.update(EditorState.set(editorState, {
      inCompositionMode: true
    }));
    startDOMObserver(editor);
  },

  /**
   * A `compositionstart` event has fired while we're still in composition
   * mode. Continue the current composition session to prevent a re-render.
   */
  onCompositionUpdate: function onCompositionUpdate(editor, e) {
    console.log('onCompositionUpdate======');
    var editorState = editor._latestEditorState; // editOnBeforeInput(editor, e);

    var selection = editorState.getSelection();
    var contentState = editorState.getCurrentContent(); // if (!selection.isCollapsed()) {
    //   editor.props.handleBeforeReplaceText(editorState);
    //   const updatedContentState = DraftModifier.removeRange(
    //     contentState,
    //     selection,
    //     'forward',
    //   );
    //   editorState = EditorState.push(
    //     editorState,
    //     updatedContentState,
    //     'remove-range',
    //   );
    //   editor.update(editorState);
    // }
  },

  /**
   * Attempt to end the current composition session.
   *
   * Defer handling because browser will still insert the chars into active
   * element after `compositionend`. If a `compositionstart` event fires
   * before `resolveComposition` executes, our composition session will
   * continue.
   *
   * The `resolved` flag is useful because certain IME interfaces fire the
   * `compositionend` event multiple times, thus queueing up multiple attempts
   * at handling the composition. Since handling the same composition event
   * twice could break the DOM, we only use the first event. Example: Arabic
   * Google Input Tools on Windows 8.1 fires `compositionend` three times.
   */
  onCompositionEnd: function onCompositionEnd(editor, e) {
    console.log('onCompositionEnd======');
    resolved = false;
    stillComposing = false;
    console.log('onCompositionEnd-stillComposing', stillComposing);
    isCompositionEnd = true;
    e.persist();
    console.log('onCompositionEnd-isOnBeforeInput', isOnBeforeInput);

    if (!isOnBeforeInput) {
      setTimeout(function () {
        if (!resolved) {
          DraftEditorCompositionHandler.resolveComposition(editor, e);
        }
      }, RESOLVE_DELAY);
    }
  },
  onSelect: editOnSelect,
  onBeforeInput: function onBeforeInput(editor, e) {
    console.log('onBeforeInput=================');
    isOnBeforeInput = true; // editOnBeforeInput(editor, e);
    // handle when user not typing IME

    if (!domObserver && !editor._latestEditorState.isInCompositionMode()) {
      editOnBeforeInput(editor, e);
    }

    resolved = false;
    stillComposing = false;
    console.log('onCompositionEnd-stillComposing', stillComposing);
    isCompositionEnd = true;
    e.persist();
    setTimeout(function () {
      if (!resolved) {
        DraftEditorCompositionHandler.resolveComposition(editor, e);
      }
    }, RESOLVE_DELAY);
  },

  /**
   * In Safari, keydown events may fire when committing compositions. If
   * the arrow keys are used to commit, prevent default so that the cursor
   * doesn't move, otherwise it will jump back noticeably on re-render.
   */
  onKeyDown: function onKeyDown(editor, e) {
    console.log('onKeyDown==========');

    if (!stillComposing) {
      console.log('onKeyDown-stillComposing', stillComposing); // If a keydown event is received after compositionend but before the
      // 20ms timer expires (ex: type option-E then backspace, or type A then
      // backspace in 2-Set Korean), we should immediately resolve the
      // composition and reinterpret the key press in edit mode.

      DraftEditorCompositionHandler.resolveComposition(editor);

      editor._onKeyDown(e);

      return;
    }

    if (e.which === Keys.RIGHT || e.which === Keys.LEFT) {
      e.preventDefault();
    } // const editorState = editor._latestEditorState;
    // const isMobile = checkDevice();
    // if (!isMobile) {
    //   if (
    //     e.key === 'Process' &&
    //     e.nativeEvent &&
    //     e.nativeEvent.code === 'Space' &&
    //     !stillComposing
    //   ) {
    //     const timeStamp = e.timeStamp;
    //     setTimeout(() => {
    //       editor.props.handleBeforeInput &&
    //         editor.props.handleBeforeInput('　', editorState, timeStamp);
    //     }, 0);
    //   }
    //   if (
    //     domObserver &&
    //     !(
    //       e.key === 'Process' &&
    //       e.nativeEvent &&
    //       (e.nativeEvent.code === 'Space' || e.nativeEvent.code === 'Enter') &&
    //       stillComposing
    //     )
    //   ) {
    //     editOnKeyDown(editor, e);
    //     if (e.key === 'Backspace') {
    //       keyCommandPlainBackspace(editorState);
    //     }
    //     // if (!stillComposing) {
    //     // If a keydown event is received after compositionend but before the
    //     // 20ms timer expires (ex: type option-E then backspace, or type A then
    //     // backspace in 2-Set Korean), we should immediately resolve the
    //     // composition and reinterpret the key press in edit mode.
    //     // editor._onKeyDown(e);
    //     //   return;
    //     // }
    //   } else {
    //     if (e.key === 'Backspace') {
    //       keyCommandPlainBackspace(editorState);
    //     }
    //     if (!stillComposing) {
    //       editOnKeyDown(editor, e);
    //     }
    //     return;
    //   }
    // } else {
    //   if (!stillComposing) {
    //     // If a keydown event is received after compositionend but before the
    //     // 20ms timer expires (ex: type option-E then backspace, or type A then
    //     // backspace in 2-Set Korean), we should immediately resolve the
    //     // composition and reinterpret the key press in edit mode.
    //     DraftEditorCompositionHandler.resolveComposition(editor);
    //     editor._onKeyDown(e);
    //     return;
    //   }
    // }
    // if (e.which === Keys.RIGHT || e.which === Keys.LEFT) {
    //   e.preventDefault();
    // }

  },

  /**
   * Keypress events may fire when committing compositions. In Firefox,
   * pressing RETURN commits the composition and inserts extra newline
   * characters that we do not want. `preventDefault` allows the composition
   * to be committed while preventing the extra characters.
   */
  onKeyPress: function onKeyPress(editor, e) {
    if (e.which === Keys.RETURN) {
      e.preventDefault();
    }
  },

  /**
   * Attempt to insert composed characters into the document.
   *
   * If we are still in a composition session, do nothing. Otherwise, insert
   * the characters into the document and terminate the composition session.
   *
   * If no characters were composed -- for instance, the user
   * deleted all composed characters and committed nothing new --
   * force a re-render. We also re-render when the composition occurs
   * at the beginning of a leaf, to ensure that if the browser has
   * created a new text node for the composition, we will discard it.
   *
   * Resetting innerHTML will move focus to the beginning of the editor,
   * so we update to force it back to the correct place.
   */
  resolveComposition: function resolveComposition(editor, e) {
    console.log('event', e);
    console.log('resolveComposition===========');
    console.log('resolveComposition-stillComposing: ', stillComposing);

    if (stillComposing) {
      return;
    }

    var isMobile = checkDevice();
    var mutations = nullthrows(domObserver).stopAndFlushMutations();
    domObserver = null;
    resolved = true;
    var editorState = EditorState.set(editor._latestEditorState, {
      inCompositionMode: false
    });
    editor.exitCurrentMode();

    if (!mutations.size) {
      editor.update(editorState);
      return;
    } // TODO, check if Facebook still needs this flag or if it could be removed.
    // Since there can be multiple mutations providing a `composedChars` doesn't
    // apply well on this new model.
    // if (
    //   gkx('draft_handlebeforeinput_composed_text') &&
    //   editor.props.handleBeforeInput &&
    //   isEventHandled(
    //     editor.props.handleBeforeInput(
    //       composedChars,
    //       editorState,
    //       event.timeStamp,
    //     ),
    //   )
    // ) {
    //   return;
    // }
    // editor.props.handleBeforeInput(
    //         e.data,
    //         editorState,
    //         e.timeStamp,
    //       );


    var contentState = editorState.getCurrentContent();

    if (!isMobile) {
      editor.update(EditorState.set(editor._latestEditorState, {
        inCompositionMode: false
      }));

      if (e.data || e.key === 'Process' && e.nativeEvent && e.nativeEvent.code === 'Space' || !domObserver) {
        var currentSelection = editor._latestEditorState.getSelection();

        if (!(e.key === 'Process' && e.nativeEvent && e.nativeEvent.code === 'Space')) {
          console.log('xinchao, co vao day ko');
          var focusOffset = currentSelection.getFocusOffset();
          currentSelection = currentSelection.merge({
            anchorOffset: focusOffset - e.data.length < 0 ? focusOffset : focusOffset - e.data.length,
            focusOffset: focusOffset - e.data.length < 0 ? focusOffset : focusOffset - e.data.length
          });
          var newEditorState = EditorState.forceSelection(editor._latestEditorState, currentSelection);
          editor.update(newEditorState);
        }
      }

      mutations.forEach(function (composedChars, offsetKey) {
        var selectionState = editor._latestEditorState.getSelection();

        var focusKey = selectionState.focusKey;

        var contentState = editor._latestEditorState.getCurrentContent();

        var block = contentState.getBlockForKey(focusKey);
        var blockText = block.getText();
        console.log('blockText======', blockText);
        console.log('composedChars======', composedChars);
        var chars = getDifference(blockText, String(composedChars));
        console.log('chars', chars);
        editOnBeforeInput2(editor, e, chars);
      });
      stillComposing = false;
      domObserver = null;
      resolved = true;
      isOnBeforeInput = false;
      return;
    }

    mutations.forEach(function (composedChars, offsetKey) {
      var _DraftOffsetKey$decod = DraftOffsetKey.decode(offsetKey),
          blockKey = _DraftOffsetKey$decod.blockKey,
          decoratorKey = _DraftOffsetKey$decod.decoratorKey,
          leafKey = _DraftOffsetKey$decod.leafKey;

      if (editorState.getBlockTree(blockKey).getIn([decoratorKey, 'leaves', leafKey])) {
        var _editorState$getBlock = editorState.getBlockTree(blockKey).getIn([decoratorKey, 'leaves', leafKey]),
            start = _editorState$getBlock.start,
            end = _editorState$getBlock.end;

        var replacementRange = editorState.getSelection().merge({
          anchorKey: blockKey,
          focusKey: blockKey,
          anchorOffset: start,
          focusOffset: end,
          isBackward: false
        });
        var entityKey = getEntityKeyForSelection(contentState, replacementRange);
        var currentStyle = contentState.getBlockForKey(blockKey).getInlineStyleAt(start);
        contentState = DraftModifier.replaceText(contentState, replacementRange, composedChars, currentStyle, entityKey); // We need to update the editorState so the leaf node ranges are properly
        // updated and multiple mutations are correctly applied.

        editorState = EditorState.set(editorState, {
          currentContent: contentState
        });
      }
    }); // When we apply the text changes to the ContentState, the selection always
    // goes to the end of the field, but it should just stay where it is
    // after compositionEnd.

    var documentSelection = getDraftEditorSelection(editorState, getContentEditableContainer(editor));
    var compositionEndSelectionState = documentSelection.selectionState;
    editor.restoreEditorDOM();
    var editorStateWithUpdatedSelection = EditorState.acceptSelection(editorState, compositionEndSelectionState);
    editor.update(EditorState.push(editorStateWithUpdatedSelection, contentState, 'insert-characters'));
  }
};
module.exports = DraftEditorCompositionHandler;