function RandomColor() {
  var hex = (Math.round(Math.random()*0xffffff)).toString(16);
  while (hex.length < 6) hex = "0" + hex;
  return hex;
}

module.exports.randomColor = RandomColor;