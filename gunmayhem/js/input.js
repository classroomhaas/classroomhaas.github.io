const keyPressed=(evt)=>{
    //player1
    if(evt.keyCode===39){
        player1.right=true;
    }if(evt.keyCode===37){
        player1.left=true;
    }
    if(evt.keyCode===97){
        player1.fired=true;
    } 
    if(evt.keyCode===38){
        player1.jumped=true;
    }
    if(evt.keyCode===40){
        player1.down=true;
    }

    //player2
    if(evt.keyCode===68){
        player2.right=true;
    }if(evt.keyCode===65){
        player2.left=true;
    }
    if(evt.keyCode===74){
        player2.fired=true;
    } 
    if(evt.keyCode===87){
        player2.jumped=true;
    }
    if(evt.keyCode===83){
        player2.down=true;
    }
}


const keyLift=(evt)=>{
    if(evt.keyCode===39){
        player1.right=false;
    } if(evt.keyCode===37){
        player1.left=false;
    }
    if(evt.keyCode===97){
        player1.fired=false;
    } 
    if(evt.keyCode===40){
        player1.down=false;
    }

    //player2
    if(evt.keyCode===68){
        player2.right=false;
    }if(evt.keyCode===65){
        player2.left=false;
    }
    if(evt.keyCode===74){
        player2.fired=false;
    } 
    if(evt.keyCode===87){
        player2.jumped=false;
    }
    if(evt.keyCode===83){
        player2.down=false;
    }
}


document.addEventListener("keydown",keyPressed);
document.addEventListener("keyup",keyLift)

