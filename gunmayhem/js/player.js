var player1Text = document.getElementById("player1");
var player2Text = document.getElementById("player2");
function player(who,index){
this.x;
this.y;
this.left=false;
this.right=false;
this.fired=false;
this.jumped=false;
this.hp=5;
var pics=[playerPic,player2Pic];
this.pic = pics[Math.floor(Math.random()*2)];
this.down=false;
let aboveIndex=0;
let belowIndex=0;
this.facingLeft=false;
let checkDown=true;
var rifle = new gun(12,1,60,this,[],100,60,true);
var shotgun = new gun(10,3,30,this,[-0.1,0,0.1],0,70,false)
var sniper = new gun(20,1,40,this,[],0,300,false)
var all = [rifle,shotgun,sniper];
this.gun=  rifle;
this.yv=0;
let innerText

if(index ==1 ){
   innerText= player2Text;
}else{
    innerText=player1Text;
}

this.fire=()=>{
    if(this.fired){
        this.gun.fire(who);
    }else{
        if(this.gun.con==true){
            this.gun.shots=[];
        }
    }    
}

this.move=()=>{

    if(this.jumped){
        // this.yv=-5;
        this.jumped=false;
    }
    this.y+=this.yv;
    this.gun.move();
    if(this.right){
        this.facingLeft=false;
        this.x+=2;
    }
    if(this.left){
        this.facingLeft=true;
        this.x-=2;
    }
    if(this.y>canvas.height||this.x<0||this.x>canvas.width){
        this.reset();
        this.hp-=1;
        innerText.innerText= `Lives : ${this.hp}`;
        if(this.hp==0){
            end.classList.add("active");
            player2.hp=5;
            player1.hp=5;
            innerText.innerText= `Lives : ${this.hp}`;
            
            winnertext.innerText=`Winner: Player${index}`;
        }
    }
}

this.reset=()=>{
    this.down=false;
    this.jumped=false;
    this.x=Math.floor((Math.random()*300)+200);
    this.y=0;
    this.yv=0;
}

this.check=(bruh)=>{
    bruh.forEach((el)=>{
        this.gun.check(el);
    })
    
}

this.draw=()=>{
    drawBitmapWithRotation(this.pic,this.x,this.y)
    this.gun.draw();
}

this.checkMap=()=>{
    if(this.down){
       aboveIndex=getIndex(this.x,this.y);
       belowIndex= getIndex(this.x,this.y+20);
       this.down=false;
    }

    if(aboveIndex!=0){
        let currentIndex = getIndex(this.x,this.y-20);
        if(currentIndex!==belowIndex){
            this.yv+=0.5;
        }else{
            aboveIndex=0;
            belowIndex=0;
        }
    }

    //checkAbove
    let sameGround = level1[getIndex(this.x,this.y)]
    if(sameGround==1&&this.jumped){
            this.yv=-3.7;
            this.jumped=false;
            checkDown=false;
            setTimeout(()=>{
                checkDown=true;
            },200);   
    }
    if(sameGround==2){
        this.gun = all[Math.floor(Math.random()*3)];
        level1[getIndex(this.x,this.y)]=0;
        let findIndex=-1;
        chests.forEach((el,index)=>{
            if(el.index==sameGround){
                findIndex=index;
            }
        })
        if(findIndex>=0){
            chests.splice(findIndex,1);
        }
    }

    //belowCheck
    if(checkDown){
        if(level1[getIndex(this.x+20,this.y+20)]==1&&this.jumped){
            this.yv=-5;
            this.jumped=false;
        }else if(level1[getIndex(this.x+20,this.y+20)]==1){
            if(aboveIndex==0){
                this.yv=0;
            }                 
        }else{
            this.yv+=0.2
        }
    }


}



}