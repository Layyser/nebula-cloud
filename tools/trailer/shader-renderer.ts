import vertexSource from '../../../nebula-frontend/src/shaders/vertex.glsl'
import fragmentSource from '../../../nebula-frontend/src/shaders/nebula.glsl'

export function createShaderRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false })!
  if (!gl) throw new Error('The trailer requires WebGL2 for the original Nebula shader.')
  function compile(type: number, source: string) {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source); gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader)!)
    return shader
  }
  const program = gl.createProgram()!
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource))
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program)!)
  gl.useProgram(program)
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,0, 1,-1,0, -1,1,0, -1,1,0, 1,-1,0, 1,1,0]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'position')
  gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0)
  const normal = gl.getAttribLocation(program, 'normal')
  if (normal >= 0) gl.vertexAttrib3f(normal, 0, 0, 1)
  const uniform = (name: string) => gl.getUniformLocation(program, name)
  gl.uniform1f(uniform('aspect'), 16/9)
  gl.uniform3f(uniform('uColor1'), 1,1,1)
  gl.uniform3f(uniform('uColor2'), 75/255,75/255,75/255)
  gl.uniform3f(uniform('uColor3'), 0,0,0)
  gl.uniform1f(uniform('uSpeed'), 0.1)
  gl.uniform1f(uniform('uDensity'), 1.45)
  gl.uniform1f(uniform('uFade'), 0.8)
  gl.uniform1f(uniform('uScrollProgress'), 0)
  gl.viewport(0,0,canvas.width,canvas.height)
  const timeUniform = uniform('time')
  function draw(seconds: number) {
    gl.uniform1f(timeUniform, 12 + Math.max(0, seconds - 3.62))
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    gl.finish()
  }
  return draw
}
