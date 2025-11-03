//variables and const
let time=0;
const framesPerSecond=50;

//player
var player2;
var player1;
player1 = new player(player2,2);
player2 = new player(player1,1);
var winnertext = document.getElementById("winner");
var end = document.getElementById("end");

var allGuns = ["rifle","sniper","shotgun"];
var chests = [];
//onload
window.onload=()=>{
    player1.reset();
    player2.reset();
    setInterval(all,(1000/framesPerSecond));
}

//all movement
const all = ()=>{
    drawAll();
    moveAll();
}

//draw

const drawAll = ()=>{
    player1.fire()
    player2.fire();
    drawMap();
    chests.forEach((el)=>{
        el.draw();
    })
    player2.draw();
    player1.draw()
}

//move
const moveAll = () =>{ 
    chests.forEach((el)=>{
        el.move();
    })
    player1.checkMap();
    player1.move();
    player1.check([player2]);
    player2.checkMap();
    player2.move();
    player2.check([player1]);
}

setInterval(()=>{

    time+=0.5;
    if(time%20==0){
        chests.push(new chest());
        chests[chests.length-1].reset();
    }
},500)

