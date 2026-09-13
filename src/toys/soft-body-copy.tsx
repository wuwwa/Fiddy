/** Shared controls for every material using the upright soft-body scene. */
export const softBodyControls={
  touchGuide:[
    {gesture:'Hold to squish',description:'Rest one finger on the shape and hold. It sinks in as you wait.'},
    {gesture:'Drag to stretch',description:'Keep your finger on the shape and slide it. Lift your finger to let go.'},
    {gesture:'Try two fingers',description:'Touch two parts of the shape, then pinch, pull apart, or gently twist.'},
    {gesture:'Turn it around',description:'Drag on the empty space beside the shape to see another side.'},
  ],
  rotationHint:'Drag beside the shape to rotate',
  keyboardHint:<><kbd>←</kbd> / <kbd>→</kbd> to rotate <span>·</span> <kbd>Q</kbd> / <kbd>E</kbd> to twist <span>·</span> hold <kbd>space</kbd> + arrows to stretch</>,
};
