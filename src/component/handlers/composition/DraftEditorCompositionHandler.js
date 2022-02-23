/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict-local
 * @emails oncall+draft_js
 */

'use strict';

import type DraftEditor from 'DraftEditor.react';

const DOMObserver = require('DOMObserver');
const DraftModifier = require('DraftModifier');
const DraftOffsetKey = require('DraftOffsetKey');
const EditorState = require('EditorState');
const Keys = require('Keys');

const editOnSelect = require('editOnSelect');
const getContentEditableContainer = require('getContentEditableContainer');
const getDraftEditorSelection = require('getDraftEditorSelection');
const getEntityKeyForSelection = require('getEntityKeyForSelection');
const nullthrows = require('nullthrows');
const editOnBeforeInput = require('editOnBeforeInput');
const editOnKeyDown = require('editOnKeyDown');
const keyCommandPlainBackspace = require('keyCommandPlainBackspace');
const isEventHandled = require('isEventHandled');
const editOnBeforeInput2 = require('editOnBeforeInput2');

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
const RESOLVE_DELAY = 20;

/**
 * A handful of variables used to track the current composition and its
 * resolution status. These exist at the module level because it is not
 * possible to have compositions occurring in multiple editors simultaneously,
 * and it simplifies state management with respect to the DraftEditor component.
 */
let resolved = false;
let stillComposing = false;
let domObserver = null;
let isOnBeforeInput = false;
let compositionStartFocusOffset;
let compositionStartAnchorOffset;
let compositionStartIsBackward;
let isNewOrIsResolved = true;
function startDOMObserver(editor: DraftEditor) {
  if (!domObserver) {
    domObserver = new DOMObserver(getContentEditableContainer(editor));
    domObserver.start();
  }
}

function checkDevice(): boolean {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
  return isMobile;
}

function getDifference(a, b) {
  var i = 0;
  var j = 0;
  var result = '';

  while (j < b.length) {
    if (a[i] != b[j] || i == a.length) result += b[j];
    else i++;
    j++;
  }
  return result;
}

const DraftEditorCompositionHandler = {
  /**
   * A `compositionstart` event has fired while we're still in composition
   * mode. Continue the current composition session to prevent a re-render.
   */
  onCompositionStart: function(editor: DraftEditor, e: any): void {
    console.log('onCompositionStart======');
    console.log('onCompositionStart-stillComposing======', stillComposing);
    // console.log('onCompositionStart-resolved', resolved);
    console.log('onCompositionStart-isNewOrIsResolved', isNewOrIsResolved);
    const isMobile = checkDevice();
    let editorState = editor._latestEditorState;
    const selection = editorState.getSelection();

    // if (
    //   (isMobile && selection.getFocusKey() !== selection.getAnchorKey()) ||
    //   !isMobile
    // ) {
    //   editor.update(EditorState.set(editorState, {inCompositionMode: true}));

    //   const contentState = editorState.getCurrentContent();
    //   if (!selection.isCollapsed()) {
    //     console.log(
    //       'onCompositionStart-selection.isCollapsed()',
    //       selection.isCollapsed(),
    //     );
    //     editor.props.handleBeforeReplaceText(editorState);
    //     const updatedContentState = DraftModifier.removeRange(
    //       contentState,
    //       selection,
    //       'forward',
    //     );
    //     EditorState.push(editorState, updatedContentState, 'remove-range');
    //   }
    // }

    if (isNewOrIsResolved === true) {
      console.log('onCompositionStart-set lai compositionStartFocusOffset');
      let currentSelection = editor._latestEditorState.getSelection();
      console.log(
        'onCompositionStart-selectionState.isCollapsed()',
        currentSelection.isCollapsed(),
      );
      compositionStartFocusOffset = currentSelection.getFocusOffset();
      compositionStartAnchorOffset = currentSelection.getAnchorOffset();
      console.log(
        'onCompositionStart-compositionStartFocusOffset',
        compositionStartFocusOffset,
      );
      compositionStartIsBackward = currentSelection.getIsBackward();
      isNewOrIsResolved = false;
    }
    stillComposing = true;

    // if (isMobile && selection.getIsBackward()) {
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

    editor.update(EditorState.set(editorState, {inCompositionMode: true}));

    startDOMObserver(editor);
  },

  /**
   * A `compositionstart` event has fired while we're still in composition
   * mode. Continue the current composition session to prevent a re-render.
   */
  onCompositionUpdate: function(editor: DraftEditor, e: any): void {
    console.log('onCompositionUpdate======');
    console.log('onCompositionUpdate-event.data======', e.data);
    let editorState = editor._latestEditorState;
    const selection = editorState.getSelection();
    const contentState = editorState.getCurrentContent();
    nullthrows(domObserver).getObserverRecord();
    // if (!selection.isCollapsed()) {
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
  onCompositionEnd: function(editor: DraftEditor, e: any): void {
    console.log('onCompositionEnd======');
    resolved = false;
    isNewOrIsResolved = false;
    stillComposing = false;
    console.log('onCompositionEnd-stillComposing', stillComposing);
    e.persist();
    console.log('onCompositionEnd-isOnBeforeInput', isOnBeforeInput);
    if (!isOnBeforeInput) {
      setTimeout(() => {
        if (!resolved) {
          DraftEditorCompositionHandler.resolveComposition(editor, e);
        }
      }, RESOLVE_DELAY);
    }
  },

  onSelect: editOnSelect,

  onBeforeInput(editor: DraftEditor, e: any) {
    console.log('onBeforeInput=================');
    isOnBeforeInput = true;
    // editOnBeforeInput(editor, e);
    // handle when user not typing IME
    if (!domObserver && !editor._latestEditorState.isInCompositionMode()) {
      editOnBeforeInput(editor, e);
    }
    resolved = false;
    stillComposing = false;
    console.log('onCompositionEnd-stillComposing', stillComposing);
    isNewOrIsResolved = false;

    e.persist();

    setTimeout(() => {
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
  onKeyDown: function(editor: DraftEditor, e: any): void {
    console.log('onKeyDown==========');
    if (!stillComposing) {
      console.log('onKeyDown-stillComposing', stillComposing);
      // If a keydown event is received after compositionend but before the
      // 20ms timer expires (ex: type option-E then backspace, or type A then
      // backspace in 2-Set Korean), we should immediately resolve the
      // composition and reinterpret the key press in edit mode.
      DraftEditorCompositionHandler.resolveComposition(editor);
      editor._onKeyDown(e);
      return;
    }
    if (e.which === Keys.RIGHT || e.which === Keys.LEFT) {
      e.preventDefault();
    }
    // const editorState = editor._latestEditorState;
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
  onKeyPress: function(editor: DraftEditor, e: any): void {
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

  resolveComposition: function(editor: DraftEditor, e: any): void {
    console.log('event', e);
    console.log('resolveComposition===========');
    console.log('resolveComposition-stillComposing: ', stillComposing);
    if (stillComposing) {
      return;
    }
    const isMobile = checkDevice();

    const mutations = nullthrows(domObserver).stopAndFlushMutations();
    domObserver = null;
    resolved = true;
    isNewOrIsResolved = true;

    // let editorState = EditorState.set(editor._latestEditorState, {
    //   inCompositionMode: false,
    // });
    let editorState = editor._latestEditorState;
    editor.exitCurrentMode();

    // if (!mutations.size) {
    //   editor.update(editorState);
    //   return;
    // }

    // TODO, check if Facebook still needs this flag or if it could be removed.
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

    let contentState = editorState.getCurrentContent();

    if (!isMobile) {
      // editor.update(
      //   EditorState.set(editor._latestEditorState, {
      //     inCompositionMode: false,
      //   }),
      // );

      mutations.forEach((composedChars, offsetKey) => {
        let selectionState = editor._latestEditorState.getSelection();
        const {focusKey} = selectionState;
        const contentState = editor._latestEditorState.getCurrentContent();

        const block = contentState.getBlockForKey(focusKey);
        const blockText = block.getText();
        console.log('blockText======', blockText);
        console.log('composedChars======', composedChars);
        const chars = getDifference(blockText, String(composedChars));
        console.log('chars', chars);
        if (
          e.data ||
          (e.key === 'Process' &&
            e.nativeEvent &&
            e.nativeEvent.code === 'Space') ||
          !domObserver
        ) {
          let currentSelection = editor._latestEditorState.getSelection();

          if (
            !(
              e.key === 'Process' &&
              e.nativeEvent &&
              e.nativeEvent.code === 'Space'
            )
          ) {
            const focusOffset = currentSelection.getFocusOffset();
            console.log('focusOffset', focusOffset);
            console.log(
              'focusOffset - chars.length + 1',
              focusOffset - chars.length + 1,
            );
            console.log(
              'compositionStartFocusOffset',
              compositionStartFocusOffset,
            );
            currentSelection = currentSelection.merge({
              anchorOffset: compositionStartAnchorOffset,
              focusOffset: compositionStartFocusOffset,
              isBackward: compositionStartIsBackward,
            });
            const newEditorState = EditorState.forceSelection(
              editor._latestEditorState,
              currentSelection,
            );
            editor.update(newEditorState);
          }
        }

        editOnBeforeInput2(editor, e, composedChars);
      });
      stillComposing = false;
      domObserver = null;
      resolved = true;
      isOnBeforeInput = false;
      return;
    }

    mutations.forEach((composedChars, offsetKey) => {
      const {blockKey, decoratorKey, leafKey} = DraftOffsetKey.decode(
        offsetKey,
      );

      if (
        editorState
          .getBlockTree(blockKey)
          .getIn([decoratorKey, 'leaves', leafKey])
      ) {
        const {start, end} = editorState
          .getBlockTree(blockKey)
          .getIn([decoratorKey, 'leaves', leafKey]);

        const replacementRange = editorState.getSelection().merge({
          anchorKey: blockKey,
          focusKey: blockKey,
          anchorOffset: start,
          focusOffset: end,
          isBackward: false,
        });

        const entityKey = getEntityKeyForSelection(
          contentState,
          replacementRange,
        );
        const currentStyle = contentState
          .getBlockForKey(blockKey)
          .getInlineStyleAt(start);

        contentState = DraftModifier.replaceText(
          contentState,
          replacementRange,
          composedChars,
          currentStyle,
          entityKey,
        );
        // We need to update the editorState so the leaf node ranges are properly
        // updated and multiple mutations are correctly applied.
        editorState = EditorState.set(editorState, {
          currentContent: contentState,
        });
      }
    });

    // When we apply the text changes to the ContentState, the selection always
    // goes to the end of the field, but it should just stay where it is
    // after compositionEnd.
    const documentSelection = getDraftEditorSelection(
      editorState,
      getContentEditableContainer(editor),
    );
    const compositionEndSelectionState = documentSelection.selectionState;
    editor.restoreEditorDOM();

    const editorStateWithUpdatedSelection = EditorState.acceptSelection(
      editorState,
      compositionEndSelectionState,
    );

    editor.update(
      EditorState.push(
        editorStateWithUpdatedSelection,
        contentState,
        'insert-characters',
      ),
    );
  },
};

module.exports = DraftEditorCompositionHandler;
