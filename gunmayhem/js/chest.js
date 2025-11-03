function chest(){
    this.y;
    this.yv=0;
    this.x;
    this.inAir=true;
    this.index=0;
    this.draw=()=>{
        if(this.inAir){
            drawBitmapWithRotation(chestPic,this.x,this.y)
        }   
    }
    this.move=()=>{
        if(this.inAir){
            if(level1[getIndex(this.x+20,this.y+20)]==1){
                this.inAir=false;
                this.yv=0;
                if(level1[getIndex(this.x,this.y)]==0){
                    level1[getIndex(this.x,this.y)]=2;
                }else{
                    level1[getIndex(this.x,this.y)+1]=2;
                }        
                this.index=getIndex(this.x+20,this.y+20);
            }else{
                this.yv+=0.2;
                this.y+=this.yv;
            }
        }

    }

    this.reset=()=>{
        this.y=0;
        this.x=Math.floor(Math.random()*300)+200;
    }
}