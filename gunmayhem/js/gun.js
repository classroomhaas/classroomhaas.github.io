function gun(firePower,shots,time,what,ang,interval,pow,con){
    this.shots=[];
    this.x=0;
    this.y=0;
    this.ang=0;
    this.fired=false;
    this.con=con;
    this.facingLeft=true;
        for(var i=0;i<shots;i++){
            if(ang.length>0){
                this.shots.push(new shot(this,ang[i],time,firePower,pow));
            }else{
                this.shots.push(new shot(this,0,time,firePower,pow));
            }
            
        }


    this.draw=()=>{
        this.shots.forEach((el)=>{
            el.draw();
        })
        if(what.facingLeft){
            this.facingLeft=false;
            this.y=what.y;
            this.x=what.x-20;
            drawBitmapWithRotation(gunLeftPic,this.x,this.y)
            this.ang=3.14;
        }else{
            this.facingLeft=true;
            this.y=what.y;
            this.x=what.x+20;
            drawBitmapWithRotation(gunPic,this.x,this.y,0);
            this.ang=0;
        }
        
    }

    this.move=()=>{
        this.shots.forEach((el)=>{
                el.move();
        })
        
    }
    let counter=0;
    this.fire=()=>{
        if(con){
            counter++;
            if(counter%5==0){
                this.shots.push(new shot(this,0,time,firePower,pow))
            }

        }
        
        this.shots.forEach((el,index)=>{
                setTimeout(()=>{
                    if(el.shotReady()){
                        el.shootFrom();
                    }        
                },(index*interval))            
        })
        
    }
    this.check=(bruh)=>{
        this.shots.forEach((el,index)=>{
        el.checkCollision(bruh)    
        })
    }
}