function enemy(who){
    this.x=0;
    this.y=0;
    this.yv=0;
    this.jumped;
    this.gun = new gun(15,1,40,this,[],who,0)
    this.facingLeft=true;

    this.draw=()=>{
        rect(this.x,this.y,40,40,"yellow");
        this.gun.draw();
    }
    this.reset=()=>{
        
        this.x=300;
        this.y=200;
    }
    this.move=()=>{

        this.gun.move();
        if(level1[getIndex(this.x+40,this.y+40)]==1&&this.jumped){
            this.yv=-5;
            this.jumped=false;
        }else if(level1[getIndex(this.x+40,this.y+40)]==1){
            this.yv=0;
        }else{
            this.yv+=0.2
        }
        if(this.jumped){
            this.jumped=false;
        }
        if(who.y<this.y-10){
            this.jumped=true;

        }
        if(who.x>this.x){
            this.x+=0.5;
            this.facingLeft=false;
        }else if(who.x<this.x){
            this.x-=0.5;
            this.facingLeft=true;
        }
        this.y+=this.yv;
        this.gun.move();
    }
}