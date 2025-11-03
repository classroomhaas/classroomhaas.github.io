var level1 = [
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
    0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
    0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,
    0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,
    0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,
    0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,
    0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,
    0,0,0,0,0,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,
    0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,
    0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,
    0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
]

var chunkHeight=40;
var chunkWidth=40;
const rows=15;
const cols=20;
console.log(level1.length);


function drawMap(){
    for(var i=0;i<rows;i++){
        for(var j=0;j<cols;j++){
            let index = i*cols+j;
            switch(level1[index]){
                case 1:drawBitmapWithRotation(snowBlockPic,j*chunkWidth+20,i*chunkHeight+20);break;
                case 0:
                    rect(j*chunkWidth,(i)*chunkHeight,chunkWidth,chunkHeight,"#aac3dd");break;
                case 2:drawBitmapWithRotation(chestPic,j*chunkWidth+20,i*chunkHeight+20);break;
            }
        }
    }
}

function getIndex(x,y){
    let mapY = Math.floor(y/chunkHeight);
    let mapX = Math.floor(x/chunkWidth);
    return (mapY*cols)+mapX;
}

