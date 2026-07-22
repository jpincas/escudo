---
translationKey: "prot-testing"
title: "Simulacros y falsas alarmas"
weight: 50
---
# Simulacros y falsas alarmas

Un sistema de aviso sin probar es un rumor. El fallo es siempre el mismo — un
teléfono que no ha sonado — y solo se descubre comprobándolo.

<figure class="escudo-diagram">
  <img src="/img/diagrams/es/p-drill-1200.png" alt="Cuatro pasos: avisar, el coordinador ejecuta /test, contar y arreglar.">
</figure>

## El simulacro, dos veces al año

1. **Avisar.** Decir de antemano que este mes habrá un simulacro. Sin decir
   qué día.
2. **El coordinador escribe `/test`.** Solo administradores — es el único
   comando del sistema que hace sonar todos los teléfonos del pueblo sin que
   haya ninguna emergencia. El mensaje dice qué es en su primera línea, para
   que nadie coja el coche.
3. **Contar dos cosas.** Cuántos teléfonos han sonado. Cuántos minutos hasta
   la primera respuesta.
4. **Arreglar los teléfonos que se han quedado callados.** Ese es todo el
   trabajo.

Esos dos números son la salud de la Red Escudo. Si el segundo empeora, no
reorganices nada — revisa las notificaciones.

**Dos veces al año es un tope, no un objetivo.** Los avisos de prueba son las
únicas alarmas que oye el pueblo sin que sean reales, y cada una gasta un poco
del reflejo que hace funcionar el sistema. Nadie más da uno nunca — las
comprobaciones del día a día se hacen con un mensaje normal en el grupo, que
prueba la misma notificación y no molesta a nadie
([cómo]({{< relref "alta-en-telegram" >}})).

Revisa la lista de miembros ese mismo día. La gente se muda, cambia de
teléfono y se muere.

## Falsas alarmas

**Una falsa alarma es buena señal.** Significa que alguien ha pulsado el
botón sin estar seguro, que es exactamente el comportamiento del que depende
todo el sistema. Lo que mata es dudar.

Así que:

- Todo aviso tiene un botón **Falsa alarma**, que puede pulsar quien lo dio o
  cualquier administrador. El aviso queda tachado y todos se quedan
  tranquilos.
- **Nunca se le pide explicaciones a nadie.** Ni en el grupo, ni en el bar.
- El registro se conserva, sin comentarios.
- Una **pulsación accidental** es solo una falsa alarma. Se pulsa el botón, y
  a otra cosa.

Lo único que no es una falsa alarma es pulsarlo en broma. Esa es una
conversación que el
[coordinador]({{< relref "/como-funciona/la-red-escudo" >}}) tiene una vez, en
privado.
