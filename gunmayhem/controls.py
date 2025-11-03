import settings

class KeyboardControl:
    def __init__(self, up, down, left, right, shoot):
        self.UP = up
        self.DOWN = down
        self.LEFT = left
        self.RIGHT = right
        self.SHOOT = shoot

PLAYER_1_CONTROLS = KeyboardControl(
    settings.PLAYER_1_UP,
    settings.PLAYER_1_DOWN,
    settings.PLAYER_1_LEFT,
    settings.PLAYER_1_RIGHT,
    settings.PLAYER_1_SHOOT
)

PLAYER_2_CONTROLS = KeyboardControl(
    settings.PLAYER_2_UP,
    settings.PLAYER_2_DOWN,
    settings.PLAYER_2_LEFT,
    settings.PLAYER_2_RIGHT,
    settings.PLAYER_2_SHOOT
)