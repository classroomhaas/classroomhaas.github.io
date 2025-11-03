var canvas = document.getElementById("gameCanvas");
var canvasContext=canvas.getContext("2d");
function circle(x,y,radius,color){
    canvasContext.beginPath();
    canvasContext.fillStyle = color;
    canvasContext.arc(x,y,radius,0,2*Math.PI,false);
    canvasContext.fill();
}

function rect(x,y,w,h,color){
    canvasContext.fillStyle=color;
    canvasContext.fillRect(x,y,w,h);
}

function drawBitmapWithRotation(bitmap,atX,atY,withAng){
    canvasContext.save();
    canvasContext.translate(atX,atY);
    canvasContext.rotate(withAng);
    canvasContext.drawImage(bitmap,-bitmap.width/2,-bitmap.height/2);
    canvasContext.restore();
}
